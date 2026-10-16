import { randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { domainOf, normalizeEmail } from "../contact/normalize";
import type { Db } from "../db/client";
import { activities, companies, contacts, deals, settings } from "../db/schema";
import { decrypt, encrypt } from "../google/crypto";
import { FREE_MAIL } from "../mailbox/process";

/*
 * Leads from the public editor demo (TASK-032, editor ADR-015). The editor sends a visitor's e-mail (and what they
 * tried) to POST /api/leads/demo with a token generated here; the same token lets the CRM read the demo funnel.
 * The token is stored encrypted (AES-GCM, key from BETTER_AUTH_SECRET) under the settings key "demoLeadsToken".
 */

const TOKEN_KEY = "demoLeadsToken";
/** Editor that hosts the demo (dev editor until a production editor exists, editor ADR-015). */
export const EDITOR_URL = "https://uredi-dev.inzenirji.si";
const secret = () => process.env.BETTER_AUTH_SECRET ?? "";

type Stored = { enc: string; createdAt: string };

/** New random token (32 bytes, base64url, 43 chars: the editor's bearer format). Replaces the old one. */
export async function createDemoToken(db: Db, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const value: Stored = { enc: encrypt(token, secret()), createdAt: now.toISOString() };
  await db
    .insert(settings)
    .values({ key: TOKEN_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } });
  return token;
}

export async function demoTokenInfo(db: Db): Promise<{ token: string; createdAt: Date } | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, TOKEN_KEY));
  const v = row?.value as Stored | undefined;
  if (!v?.enc) return null;
  try {
    return { token: decrypt(v.enc, secret()), createdAt: new Date(v.createdAt) };
  } catch {
    return null;
  }
}

/** True when the Authorization header carries the current token. */
export async function checkDemoToken(db: Db, header: string | null): Promise<boolean> {
  const got = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? "")?.[1];
  const info = await demoTokenInfo(db);
  if (!got || !info) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(info.token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type DemoEdit = { request: string; reply: string; changed: boolean; at: string };
export type DemoLead = { ref: string; email: string; website: string | null; startedAt: string; emailAt: string; edits: DemoEdit[] };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Validates the editor's payload; null when unusable. */
export function parseDemoLead(body: unknown): DemoLead | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const email = normalizeEmail(str(b.email, 254));
  const ref = str(b.ref, 64);
  if (!email || !/^[0-9a-f]{8,64}$/.test(ref)) return null;
  const edits = Array.isArray(b.edits)
    ? b.edits.slice(0, 20).map((e) => {
        const x = (e ?? {}) as Record<string, unknown>;
        return { request: str(x.request, 500), reply: str(x.reply, 1000), changed: x.changed === true, at: str(x.at, 40) };
      })
    : [];
  return {
    ref,
    email,
    website: str(b.website, 200) || null,
    startedAt: str(b.startedAt, 40),
    emailAt: str(b.emailAt, 40),
    edits: edits.filter((e) => e.request),
  };
}

/** Company name for a demo lead: the website's domain, else the company e-mail domain, else the e-mail itself. */
export function leadName(lead: Pick<DemoLead, "email" | "website">): string {
  const site = domainOf(lead.website);
  if (site) return site;
  const host = domainOf(lead.email);
  return host && !FREE_MAIL.test(host) ? host : lead.email;
}

/**
 * Stores a demo lead: finds the company by e-mail or website domain or creates one with a deal (source editor_demo,
 * next action now), adds the e-mail as a contact and a note with what the visitor tried. Idempotent per `ref`.
 */
export async function importDemoLead(db: Db, lead: DemoLead, now = new Date()): Promise<{ companyId: string; created: boolean; duplicate: boolean }> {
  const [dup] = await db
    .select({ companyId: deals.companyId })
    .from(activities)
    .innerJoin(deals, eq(deals.id, activities.dealId))
    .where(and(eq(activities.type, "note"), sql`${activities.payload}->>'kind' = 'editor_demo'`, sql`${activities.payload}->>'ref' = ${lead.ref}`))
    .limit(1);
  if (dup) return { companyId: dup.companyId, created: false, duplicate: true };

  const website = lead.website ? (/^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`) : null;
  const siteDomain = domainOf(website);
  return db.transaction(async (tx) => {
    let companyId: string | undefined;
    const [byEmail] = await tx.select({ id: contacts.companyId }).from(contacts).where(eq(contacts.email, lead.email)).limit(1);
    companyId = byEmail?.id;
    if (!companyId && siteDomain) {
      const [bySite] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.websiteDomain, siteDomain)).limit(1);
      companyId = bySite?.id;
    }
    const created = !companyId;
    if (!companyId) {
      const [c] = await tx
        .insert(companies)
        .values({ name: leadName(lead), website, websiteDomain: siteDomain })
        .returning({ id: companies.id });
      companyId = c.id;
    }
    let [deal] = await tx.select({ id: deals.id }).from(deals).where(eq(deals.companyId, companyId));
    if (!deal) [deal] = await tx.insert(deals).values({ companyId, source: "editor_demo", nextActionAt: now }).returning({ id: deals.id });
    else await tx.update(deals).set({ nextActionAt: now, updatedAt: now }).where(eq(deals.id, deal.id));
    await tx.insert(contacts).values({ companyId, email: lead.email, emailSource: "vpisal v demo urejevalnika" }).onConflictDoNothing();
    await tx.insert(activities).values({
      dealId: deal.id,
      type: "note",
      at: now,
      payload: { kind: "editor_demo", ref: lead.ref, website: lead.website, startedAt: lead.startedAt, emailAt: lead.emailAt, edits: lead.edits },
    });
    return { companyId, created, duplicate: false };
  });
}

export type DemoNote = { at: Date; website: string | null; edits: DemoEdit[] };

/** Demo visits of one company (newest first), for the company page. */
export async function demoNotes(db: Db, companyId: string): Promise<DemoNote[]> {
  const rows = await db
    .select({ at: activities.at, payload: activities.payload })
    .from(activities)
    .innerJoin(deals, eq(deals.id, activities.dealId))
    .where(and(eq(deals.companyId, companyId), eq(activities.type, "note"), sql`${activities.payload}->>'kind' = 'editor_demo'`))
    .orderBy(desc(activities.at));
  return rows.map((r) => {
    const p = r.payload as { website?: string | null; edits?: DemoEdit[] };
    return { at: r.at, website: p.website ?? null, edits: p.edits ?? [] };
  });
}

/** Recent demo leads for "Danes": newest first, with the first requests. */
export async function recentDemoLeads(db: Db, days = 14, limit = 10) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({ companyId: companies.id, name: companies.name, stage: deals.stage, at: activities.at, payload: activities.payload })
    .from(activities)
    .innerJoin(deals, eq(deals.id, activities.dealId))
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(and(eq(activities.type, "note"), sql`${activities.payload}->>'kind' = 'editor_demo'`, sql`${activities.at} >= ${since.toISOString()}`))
    .orderBy(desc(activities.at))
    .limit(limit);
  return rows.map((r) => {
    const p = r.payload as { edits?: DemoEdit[] };
    return { companyId: r.companyId, name: r.name, stage: r.stage, at: r.at, requests: (p.edits ?? []).map((e) => e.request).slice(0, 3) };
  });
}

export type EditorStats = { visits: number; edited: number; emails: number; edits: number; costMicros: number };

/** Funnel: editor numbers (fetched with the token) + demo deals that reached a call or were won. */
export async function demoFunnel(
  db: Db,
  editorUrl = EDITOR_URL,
  days = 30,
  fetchImpl: typeof fetch = fetch,
): Promise<{ editor: EditorStats | null; error: string | null; calls: number; won: number; leads: number }> {
  const since = new Date(Date.now() - days * 86_400_000);
  const [crm] = await db
    .select({
      leads: sql<number>`count(*)::int`,
      calls: sql<number>`count(*) filter (where ${deals.callAt} is not null or ${deals.stage} in ('call_booked','call_done','proposal_sent','won'))::int`,
      won: sql<number>`count(*) filter (where ${deals.stage} = 'won')::int`,
    })
    .from(deals)
    .where(and(eq(deals.source, "editor_demo"), sql`${deals.createdAt} >= ${since.toISOString()}`));
  const base = { calls: crm?.calls ?? 0, won: crm?.won ?? 0, leads: crm?.leads ?? 0 };
  const info = await demoTokenInfo(db);
  if (!info) return { ...base, editor: null, error: "Ključ še ni ustvarjen." };
  try {
    const res = await fetchImpl(`${editorUrl.replace(/\/+$/, "")}/api/demo/stats?days=${days}`, {
      headers: { Authorization: `Bearer ${info.token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) return { ...base, editor: null, error: "Urejevalnik ključa ne pozna: vpiši ga v Cloudflare (CRM_LEADS_TOKEN)." };
    if (!res.ok) return { ...base, editor: null, error: `Urejevalnik je vrnil napako ${res.status}.` };
    return { ...base, editor: (await res.json()) as EditorStats, error: null };
  } catch {
    return { ...base, editor: null, error: "Urejevalnik ni dosegljiv." };
  }
}

