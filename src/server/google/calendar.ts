import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { activities, calendarEvents, deals, googleAccounts } from "../db/schema";
import { matchAddress } from "../mailbox/process";
import { decrypt, encrypt } from "./crypto";
import { GoogleError, oauthConfigFromEnv, refreshAccessToken, type OAuthConfig } from "./oauth";

/*
 * Google Calendar sync (TASK-012b, ADR-029). Reads the owner's primary calendar from 7 days back to 60 days ahead.
 * Events with other attendees (e.g. Google appointment-schedule bookings) are matched to companies by attendee
 * e-mail; a matched deal gets stage `call_booked` with the event time; a cancelled event sends it back to `replied`.
 */

export async function saveAccount(db: Db, a: { email: string; refreshToken: string; scope: string }, secret: string) {
  const enc = encrypt(a.refreshToken, secret);
  await db.delete(googleAccounts);
  await db.insert(googleAccounts).values({ email: a.email, refreshTokenEnc: enc, scope: a.scope });
}

export async function getAccount(db: Db) {
  const [a] = await db.select().from(googleAccounts).limit(1);
  return a ?? null;
}

export async function disconnect(db: Db) {
  await db.delete(googleAccounts);
}

type GEvent = {
  id: string;
  status: string;
  summary?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  attendees?: { email?: string; self?: boolean; organizer?: boolean; responseStatus?: string }[];
};

export type CalendarResult = { events: number; matched: number; booked: number; cancelled: number };

export async function listEvents(accessToken: string, now: Date, fetchImpl: typeof fetch = fetch): Promise<GEvent[]> {
  const q = new URLSearchParams({
    timeMin: new Date(now.getTime() - 7 * 86_400_000).toISOString(),
    timeMax: new Date(now.getTime() + 60 * 86_400_000).toISOString(),
    singleEvents: "true",
    showDeleted: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetchImpl(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new GoogleError(res.status);
  return ((await res.json()) as { items?: GEvent[] }).items ?? [];
}

/** Applies events to deals; pure DB part, so it is testable without Google. */
export async function applyEvents(db: Db, events: GEvent[], ownerEmail: string, now = new Date()): Promise<CalendarResult> {
  const out: CalendarResult = { events: 0, matched: 0, booked: 0, cancelled: 0 };
  for (const e of events) {
    const others = (e.attendees ?? []).filter((a) => a.email && !a.self && a.email.toLowerCase() !== ownerEmail.toLowerCase()).map((a) => a.email!.toLowerCase());
    const startRaw = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T08:00:00Z` : null);
    if (!others.length || !startRaw) continue;
    out.events++;
    const startAt = new Date(startRaw);
    let match = null;
    for (const a of others) {
      match = await matchAddress(db, a);
      if (match) break;
    }
    await db
      .insert(calendarEvents)
      .values({ eventId: e.id, summary: (e.summary ?? "").slice(0, 300), startAt, status: e.status, attendees: others.join(", "), companyId: match?.companyId ?? null, htmlLink: e.htmlLink ?? null, updatedAt: now })
      .onConflictDoUpdate({
        target: calendarEvents.eventId,
        set: { summary: (e.summary ?? "").slice(0, 300), startAt, status: e.status, attendees: others.join(", "), companyId: match?.companyId ?? null, htmlLink: e.htmlLink ?? null, updatedAt: now },
      });
    if (!match?.dealId) continue;
    out.matched++;
    const [d] = await db.select().from(deals).where(eq(deals.id, match.dealId)).limit(1);
    if (!d) continue;
    if (e.status === "cancelled") {
      if (d.stage === "call_booked" && d.callAt && Math.abs(d.callAt.getTime() - startAt.getTime()) < 60_000) {
        await db.update(deals).set({ stage: "replied", callAt: null, nextActionAt: null, updatedAt: now }).where(eq(deals.id, d.id));
        await db.insert(activities).values({ dealId: d.id, type: "booking", at: now, payload: { cancelled: true, eventId: e.id, by: "calendar" } });
        out.cancelled++;
      }
      continue;
    }
    if (startAt.getTime() < now.getTime() - 3600_000) continue; // past events do not book anything
    const early = ["found", "researched", "contacted", "replied", "nurture"].includes(d.stage);
    const moved = d.stage === "call_booked" && (!d.callAt || d.callAt.getTime() !== startAt.getTime());
    if (early || moved) {
      await db.update(deals).set({ stage: "call_booked", callAt: startAt, nextActionAt: startAt, updatedAt: now }).where(eq(deals.id, d.id));
      await db.insert(activities).values({ dealId: d.id, type: "booking", at: now, payload: { from: d.stage, to: "call_booked", callAt: startAt.toISOString(), eventId: e.id, by: "calendar" } });
      out.booked++;
    }
  }
  return out;
}

export type CalendarSync = { ok: true; result: CalendarResult } | { ok: false; message: string } | { ok: null };

export async function syncCalendar(
  db: Db,
  opts: { minAgeMs?: number; now?: Date; fetchImpl?: typeof fetch; cfg?: OAuthConfig | null } = {},
): Promise<CalendarSync> {
  const now = opts.now ?? new Date();
  const cfg = opts.cfg === undefined ? oauthConfigFromEnv() : opts.cfg;
  const acc = await getAccount(db);
  if (!cfg || !acc) return { ok: null };
  if (opts.minAgeMs && acc.lastSyncAt && now.getTime() - acc.lastSyncAt.getTime() < opts.minAgeMs) return { ok: null };
  try {
    const token = await refreshAccessToken(cfg, decrypt(acc.refreshTokenEnc, cfg.secret), opts.fetchImpl);
    const result = await applyEvents(db, await listEvents(token, now, opts.fetchImpl), acc.email, now);
    await db.update(googleAccounts).set({ lastSyncAt: now, lastError: null }).where(eq(googleAccounts.id, acc.id));
    return { ok: true, result };
  } catch (e) {
    const msg = e instanceof GoogleError && (e.status === 400 || e.status === 401) ? "Povezava z Googlom je potekla — poveži znova v Nastavitvah." : "Branje koledarja ni uspelo.";
    await db.update(googleAccounts).set({ lastError: msg }).where(eq(googleAccounts.id, acc.id));
    console.error("[calendar] sync failed:", e instanceof Error ? e.message : "unknown");
    return { ok: false, message: msg };
  }
}

/** Upcoming bookings whose attendee is not a company in the CRM yet (shown on "Klici"). */
export async function unmatchedBookings(db: Db, now = new Date()) {
  return db
    .select()
    .from(calendarEvents)
    .where(and(isNull(calendarEvents.companyId), gte(calendarEvents.startAt, now), inArray(calendarEvents.status, ["confirmed", "tentative"])))
    .orderBy(asc(calendarEvents.startAt))
    .limit(20);
}
