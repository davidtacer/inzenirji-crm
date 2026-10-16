import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { companies, contacts, deals } from "../db/schema";
import { applyEvents, getAccount, saveAccount, syncCalendar, unmatchedBookings } from "./calendar";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });
const NOW = new Date("2026-10-16T08:00:00Z");
const T = "2026-10-17T08:00:00Z";

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies, calendar_events, google_accounts RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

async function lead(email: string) {
  const [c] = await db.insert(companies).values({ name: "Fizis" }).returning();
  await db.insert(deals).values({ companyId: c.id, source: "manual", stage: "replied" });
  await db.insert(contacts).values({ companyId: c.id, email, emailSource: "x" });
  return c;
}
const ev = (over: Record<string, unknown>) => ({ id: "e1", status: "confirmed", summary: "Klic z inženirji.si", start: { dateTime: T }, attendees: [{ email: "david@gmail.com", self: true }, { email: "Info@Fizis.si" }], ...over });
const stage = async () => (await admin`select stage, call_at from deals`)[0];

describe("calendar", () => {
  it("booking by a known contact → call booked; moved → new time; cancelled → back to replied", async () => {
    await lead("info@fizis.si");
    expect(await applyEvents(db, [ev({})], "david@gmail.com", NOW)).toEqual({ events: 1, matched: 1, booked: 1, cancelled: 0 });
    expect(await stage()).toEqual({ stage: "call_booked", call_at: new Date(T) });
    expect((await applyEvents(db, [ev({})], "david@gmail.com", NOW)).booked).toBe(0);
    const T2 = "2026-10-18T09:00:00Z";
    await applyEvents(db, [ev({ start: { dateTime: T2 } })], "david@gmail.com", NOW);
    expect((await stage()).call_at).toEqual(new Date(T2));
    expect((await applyEvents(db, [ev({ status: "cancelled", start: { dateTime: T2 } })], "david@gmail.com", NOW)).cancelled).toBe(1);
    expect(await stage()).toEqual({ stage: "replied", call_at: null });
  });

  it("own events without others and past bookings change nothing; unknown attendees are listed", async () => {
    await lead("info@fizis.si");
    const r = await applyEvents(
      db,
      [
        ev({ id: "solo", attendees: [{ email: "david@gmail.com", self: true }] }),
        ev({ id: "past", start: { dateTime: "2026-10-10T08:00:00Z" } }),
        ev({ id: "new", attendees: [{ email: "neznan@firma.si" }] }),
      ],
      "david@gmail.com",
      NOW,
    );
    expect(r).toEqual({ events: 2, matched: 1, booked: 0, cancelled: 0 });
    expect((await stage()).stage).toBe("replied");
    expect((await unmatchedBookings(db, NOW)).map((e) => e.attendees)).toEqual(["neznan@firma.si"]);
  });

  it("sync: refresh token stored encrypted, access token refreshed, events applied", async () => {
    await lead("info@fizis.si");
    const cfg = { clientId: "cid", clientSecret: "cs", redirectUri: "https://x/cb", secret: "server-secret" };
    await saveAccount(db, { email: "david@gmail.com", refreshToken: "1//rt", scope: "calendar.readonly" }, cfg.secret);
    expect((await getAccount(db))!.refreshTokenEnc).not.toContain("1//rt");
    const calls: string[] = [];
    const fetchImpl = (async (u: string, init?: RequestInit) => {
      calls.push(String(u));
      if (String(u).includes("oauth2")) {
        expect(String(init?.body)).toContain("refresh_token=1%2F%2Frt");
        return new Response(JSON.stringify({ access_token: "AT" }), { status: 200 });
      }
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer AT");
      return new Response(JSON.stringify({ items: [ev({})] }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await syncCalendar(db, { cfg, fetchImpl, now: NOW })).toEqual({ ok: true, result: { events: 1, matched: 1, booked: 1, cancelled: 0 } });
    expect((await getAccount(db))!.lastSyncAt).toEqual(NOW);
    expect(await syncCalendar(db, { cfg, fetchImpl, now: NOW, minAgeMs: 60_000 })).toEqual({ ok: null });
    const expired = (async () => new Response("{}", { status: 400 })) as unknown as typeof fetch;
    expect(await syncCalendar(db, { cfg, fetchImpl: expired, now: new Date(NOW.getTime() + 3600_000) })).toEqual({ ok: false, message: "Povezava z Googlom je potekla — poveži znova v Nastavitvah." });
  });
});
