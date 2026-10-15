import { and, asc, desc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { addToDnc, isBlocked } from "../contact/dnc";
import { normalizeEmail } from "../contact/normalize";
import { websiteKind } from "../contact/website";
import type { Db } from "../db/client";
import { activities, audits, companies, competitorLinks, contacts, deals, drafts } from "../db/schema";
import type { Issue } from "../research/analyze";
import { rescoreCompany } from "../scoring/apply";
import { composeFirst, composeFollowUp1, composeFollowUp2, type ComposeInput } from "./compose";

/*
 * Drafts and the approval queue (TASK-008, ADR-004). Nothing here sends: drafts are only created,
 * edited, approved or discarded. Sending is `sendApprovedDraft()` in send.ts — the one choke point.
 */

export type DraftResult = { ok: true; draftId: string } | { ok: false; reason: "NOT_FOUND" | "NOT_RESEARCHED" | "NO_EMAIL" | "BLOCKED" | "EXISTS" | "WRONG_STAGE" };

export const DRAFT_REASON: Record<Exclude<DraftResult, { ok: true }>["reason"], string> = {
  NOT_FOUND: "Podjetja ni.",
  NOT_RESEARCHED: "Podjetje še ni raziskano.",
  NO_EMAIL: "Podjetje nima javnega e-naslova. Dodaj ga ročno (z virom).",
  BLOCKED: "Podjetje ali e-naslov je na seznamu »ne kontaktiraj«.",
  EXISTS: "Osnutek za ta korak že obstaja.",
  WRONG_STAGE: "Podjetje je že v kasnejši fazi (kontaktirano ali dlje).",
};

async function composeInput(db: Db, companyId: string) {
  const [row] = await db
    .select({ c: companies, dealId: deals.id, stage: deals.stage })
    .from(companies)
    .innerJoin(deals, eq(deals.companyId, companies.id))
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!row) return null;
  const [audit] = await db.select().from(audits).where(eq(audits.companyId, companyId)).orderBy(desc(audits.createdAt)).limit(1);
  const rivals = await db
    .select({ name: companies.name, domain: companies.websiteDomain, distanceM: competitorLinks.distanceM })
    .from(competitorLinks)
    .innerJoin(companies, eq(companies.id, competitorLinks.competitorId))
    .where(eq(competitorLinks.companyId, companyId))
    .orderBy(sql`${competitorLinks.distanceM} asc nulls last`);
  const rival = rivals.find((r) => websiteKind(r.domain) === "own") ?? null;
  const [contact] = await db
    .select({ email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.companyId, companyId), sql`${contacts.email} is not null`))
    .orderBy(asc(contacts.createdAt))
    .limit(1);
  const input: ComposeInput = {
    name: row.c.name,
    city: row.c.city,
    group: row.c.group,
    websiteDomain: row.c.websiteDomain,
    ratingX10: row.c.ratingX10,
    reviewCount: row.c.reviewCount,
    issues: (audit?.issues ?? []) as Issue[],
    rival: rival ? { name: rival.name, distanceM: rival.distanceM } : null,
  };
  return { input, dealId: row.dealId, stage: row.stage, audit: audit ?? null, email: contact?.email ?? null };
}

/** Day-0 e-mail for a researched company with a published e-mail address. */
export async function createFirstDraft(db: Db, companyId: string): Promise<DraftResult> {
  const ctx = await composeInput(db, companyId);
  if (!ctx) return { ok: false, reason: "NOT_FOUND" };
  if (!ctx.audit) return { ok: false, reason: "NOT_RESEARCHED" };
  if (ctx.stage !== "researched" && ctx.stage !== "found") return { ok: false, reason: "WRONG_STAGE" };
  if (!ctx.email) return { ok: false, reason: "NO_EMAIL" };
  if (await isBlocked(db, { email: ctx.email, companyId })) return { ok: false, reason: "BLOCKED" };
  const m = composeFirst(ctx.input);
  const [d] = await db
    .insert(drafts)
    .values({ dealId: ctx.dealId, kind: "first", toEmail: ctx.email, subject: m.subject, body: m.body })
    .onConflictDoNothing()
    .returning({ id: drafts.id });
  return d ? { ok: true, draftId: d.id } : { ok: false, reason: "EXISTS" };
}

/** Prepares day-0 drafts for the given companies; returns how many were created and why others were skipped. */
export async function createFirstDrafts(db: Db, companyIds: string[]) {
  let created = 0;
  const skipped: Record<string, number> = {};
  for (const id of companyIds) {
    const r = await createFirstDraft(db, id);
    if (r.ok) created++;
    else skipped[r.reason] = (skipped[r.reason] ?? 0) + 1;
  }
  return { created, skipped };
}

/**
 * Follow-ups that are due: deal still `contacted`, next action date passed, previous step sent.
 * day 3 after the first e-mail → followup_1, day 8 (5 days after followup_1) → followup_2.
 */
export async function createDueFollowUps(db: Db, now = new Date()): Promise<number> {
  const due = await db
    .select({ dealId: deals.id, companyId: deals.companyId })
    .from(deals)
    .where(and(eq(deals.stage, "contacted"), lte(deals.nextActionAt, now)));
  let created = 0;
  for (const d of due) {
    const sent = await db
      .select({ kind: drafts.kind, status: drafts.status, subject: drafts.subject, toEmail: drafts.toEmail })
      .from(drafts)
      .where(and(eq(drafts.dealId, d.dealId), ne(drafts.status, "discarded")))
      .orderBy(asc(drafts.createdAt));
    // Wait while a step is still open (pending or approved); the next step follows the last *sent* one.
    if (sent.some((s) => s.status !== "sent")) continue;
    const first = sent.find((s) => s.kind === "first");
    if (!first) continue;
    const has = (k: string) => sent.some((s) => s.kind === k);
    const next = !has("followup_1") ? "followup_1" : !has("followup_2") ? "followup_2" : null;
    if (!next) continue;
    if (await isBlocked(db, { email: first.toEmail, companyId: d.companyId })) continue;
    const ctx = await composeInput(db, d.companyId);
    if (!ctx) continue;
    const m = next === "followup_1" ? composeFollowUp1(ctx.input, first.subject) : composeFollowUp2(ctx.input, first.subject);
    const [row] = await db
      .insert(drafts)
      .values({ dealId: d.dealId, kind: next, toEmail: first.toEmail, subject: m.subject, body: m.body })
      .onConflictDoNothing()
      .returning({ id: drafts.id });
    if (row) created++;
  }
  return created;
}

export async function listDrafts(db: Db) {
  const rows = await db
    .select({
      id: drafts.id,
      kind: drafts.kind,
      status: drafts.status,
      toEmail: drafts.toEmail,
      subject: drafts.subject,
      body: drafts.body,
      createdAt: drafts.createdAt,
      approvedAt: drafts.approvedAt,
      sentAt: drafts.sentAt,
      companyId: companies.id,
      companyName: companies.name,
      group: companies.group,
      score: companies.score,
    })
    .from(drafts)
    .innerJoin(deals, eq(deals.id, drafts.dealId))
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(inArray(drafts.status, ["pending", "approved", "sent"]))
    .orderBy(sql`${companies.score} desc nulls last`, asc(drafts.createdAt));
  return {
    pending: rows.filter((r) => r.status === "pending"),
    approved: rows.filter((r) => r.status === "approved"),
    sent: rows
      .filter((r) => r.status === "sent")
      .sort((a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0))
      .slice(0, 30),
  };
}

export async function pendingDraftCount(db: Db): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(drafts).where(eq(drafts.status, "pending"));
  return r?.n ?? 0;
}

/** Saves the owner's edits and approves in one step (ADR-004: approval is explicit and timestamped). */
export async function approveDraft(db: Db, id: string, edit: { subject: string; body: string }, now = new Date()) {
  const subject = edit.subject.trim();
  const body = edit.body.replace(/\r\n/g, "\n").trim();
  if (!subject || !body) throw new Error("DRAFT_EMPTY");
  const r = await db
    .update(drafts)
    .set({ subject, body, status: "approved", approvedAt: now })
    .where(and(eq(drafts.id, id), eq(drafts.status, "pending")))
    .returning({ id: drafts.id });
  return r.length === 1;
}

/** Pending or approved → discarded. Sent drafts stay as they are. */
export async function discardDraft(db: Db, id: string) {
  const r = await db
    .update(drafts)
    .set({ status: "discarded" })
    .where(and(eq(drafts.id, id), inArray(drafts.status, ["pending", "approved"])))
    .returning({ id: drafts.id });
  return r.length === 1;
}

/** Approved → back to pending, to edit again. */
export async function unapproveDraft(db: Db, id: string) {
  const r = await db
    .update(drafts)
    .set({ status: "pending", approvedAt: null })
    .where(and(eq(drafts.id, id), eq(drafts.status, "approved")))
    .returning({ id: drafts.id });
  return r.length === 1;
}

async function dealOf(db: Db, companyId: string) {
  const [d] = await db.select().from(deals).where(eq(deals.companyId, companyId)).limit(1);
  return d ?? null;
}

async function dropOpenDrafts(db: Db, dealId: string) {
  await db
    .update(drafts)
    .set({ status: "discarded" })
    .where(and(eq(drafts.dealId, dealId), inArray(drafts.status, ["pending", "approved"])));
}

/** The prospect answered (until mailbox sync, TASK-009, the owner marks it): stop the sequence. */
export async function markReplied(db: Db, companyId: string, now = new Date()) {
  const d = await dealOf(db, companyId);
  if (!d) return false;
  await dropOpenDrafts(db, d.id);
  await db.update(deals).set({ stage: "replied", nextActionAt: null, updatedAt: now }).where(eq(deals.id, d.id));
  await db.insert(activities).values({ dealId: d.id, type: "stage_change", at: now, payload: { from: d.stage, to: "replied", by: "owner" } });
  return true;
}

/**
 * Permanent do-not-contact for a company (ADR-007): the company, every e-mail we hold, and its own
 * website domain (never a social or free-mail domain). Open drafts are discarded, deal goes to `lost`.
 */
export async function blockCompany(db: Db, companyId: string, reason: string, now = new Date()) {
  const [c] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!c) return false;
  await addToDnc(db, { kind: "company", value: c.id, reason });
  const emails = await db.select({ email: contacts.email }).from(contacts).where(eq(contacts.companyId, companyId));
  for (const e of emails) if (e.email) await addToDnc(db, { kind: "email", value: e.email, reason });
  if (c.websiteDomain && websiteKind(c.websiteDomain) === "own") await addToDnc(db, { kind: "domain", value: c.websiteDomain, reason });
  const d = await dealOf(db, companyId);
  if (d) {
    await dropOpenDrafts(db, d.id);
    await db.update(deals).set({ stage: "lost", lostReason: reason, nextActionAt: null, updatedAt: now }).where(eq(deals.id, d.id));
    await db.insert(activities).values({ dealId: d.id, type: "stage_change", at: now, payload: { from: d.stage, to: "lost", reason, by: "owner" } });
  }
  await rescoreCompany(db, companyId);
  return true;
}

/** Owner adds a published address by hand (e.g. from the Facebook page); the source is required (ADR-007). */
export async function addContactEmail(db: Db, companyId: string, rawEmail: string, source: string) {
  const email = normalizeEmail(rawEmail);
  const src = source.trim();
  if (!email) return { ok: false as const, message: "Neveljaven e-naslov." };
  if (src.length < 4) return { ok: false as const, message: "Vpiši, kje je e-naslov objavljen (povezava)." };
  await db.insert(contacts).values({ companyId, email, emailSource: src }).onConflictDoNothing();
  await rescoreCompany(db, companyId);
  return { ok: true as const, message: `Dodan ${email}.` };
}
