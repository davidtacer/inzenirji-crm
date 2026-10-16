import { and, eq, inArray, sql } from "drizzle-orm";
import { addToDnc } from "../contact/dnc";
import { domainOf, normalizeEmail } from "../contact/normalize";
import { websiteKind } from "../contact/website";
import type { Db } from "../db/client";
import { activities, aiUsage, companies, contacts, deals, drafts, inboundMessages } from "../db/schema";
import type { AiConfig } from "../ai/remark";
import { blockCompany } from "../outreach/drafts";
import { classifyReply, ownText, type InboundMail, type ReplyClass } from "./classify";
import { composeReply, type ContactOptions } from "./reply";

/*
 * Handles mail from the outreach mailbox (TASK-009, ADR-023). Only mail that belongs to a company in our
 * database is stored; everything else is ignored and never saved. Effects per class:
 * bounce → address on do-not-contact, sequence stopped · out_of_office → only logged ·
 * no → company on do-not-contact, deal lost · not_now → nurture, re-contact in 90 days ·
 * interested / question → replied, follow-ups stopped, reply draft for the owner.
 */

const OUR_ID = /<([0-9a-f-]{36})@inzenirji\.si>/gi;
const FREE_MAIL = /^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|gmx|siol|t-2|amis|telemach|guest\.arnes|email|mail)\.[a-z.]+$/i;

type Match = { companyId: string; dealId: string | null; draftId: string | null };

async function matchCompany(db: Db, m: InboundMail): Promise<Match | null> {
  // 1. Threading: In-Reply-To / References, or (for bounces) our Message-ID quoted in the body.
  const ids = [m.inReplyTo, ...m.references].filter((x): x is string => !!x);
  for (const x of m.text.matchAll(OUR_ID)) ids.push(`<${x[1]}@inzenirji.si>`);
  if (ids.length) {
    const [d] = await db
      .select({ draftId: drafts.id, dealId: drafts.dealId, companyId: deals.companyId })
      .from(drafts)
      .innerJoin(deals, eq(deals.id, drafts.dealId))
      .where(inArray(drafts.messageId, ids))
      .limit(1);
    if (d) return d;
  }
  // 2./3. Sender is a known contact, or writes from the company's own domain.
  return matchAddress(db, m.from);
}

/** A known contact's address, or an address on a company's own website domain (never free-mail). */
export async function matchAddress(db: Db, raw: string): Promise<Match | null> {
  const from = normalizeEmail(raw);
  if (!from) return null;
  const [c] = await db
    .select({ companyId: contacts.companyId, dealId: deals.id })
    .from(contacts)
    .leftJoin(deals, eq(deals.companyId, contacts.companyId))
    .where(eq(contacts.email, from))
    .limit(1);
  if (c) return { ...c, draftId: null };
  const domain = domainOf(from);
  if (domain && !FREE_MAIL.test(domain) && websiteKind(domain) === "own") {
    const [w] = await db
      .select({ companyId: companies.id, dealId: deals.id })
      .from(companies)
      .leftJoin(deals, eq(deals.companyId, companies.id))
      .where(eq(companies.websiteDomain, domain))
      .limit(1);
    if (w) return { ...w, draftId: null };
  }
  return null;
}

async function dropOpenOutreach(db: Db, dealId: string) {
  await db
    .update(drafts)
    .set({ status: "discarded" })
    .where(and(eq(drafts.dealId, dealId), inArray(drafts.status, ["pending", "approved"]), sql`${drafts.kind} <> 'reply'`));
}

export type ProcessResult = { seen: number; stored: number; byClass: Partial<Record<ReplyClass, number>> };

/**
 * `effects: false` (history import, TASK-029): only store and label; no do-not-contact, no reply drafts —
 * those mails may have been handled long ago.
 */
export async function processInbound(db: Db, mails: InboundMail[], deps: { ai: AiConfig | null; now?: Date; contact?: ContactOptions; effects?: boolean }): Promise<ProcessResult> {
  const now = deps.now ?? new Date();
  const out: ProcessResult = { seen: mails.length, stored: 0, byClass: {} };
  for (const m of mails) {
    if (!m.messageId) continue;
    const [dup] = await db.select({ id: inboundMessages.id }).from(inboundMessages).where(eq(inboundMessages.messageId, m.messageId)).limit(1);
    if (dup) continue;
    const match = await matchCompany(db, m);
    if (!match) continue;
    const c = await classifyReply(m, deps.ai);
    if (c.inputTokens) {
      await db.insert(aiUsage).values({ job: "classify", model: c.by, companyId: match.companyId, inputTokens: c.inputTokens, outputTokens: c.outputTokens, costMicroUsd: c.costMicroUsd, ok: c.by !== "default" });
    }
    const [row] = await db
      .insert(inboundMessages)
      .values({
        messageId: m.messageId,
        companyId: match.companyId,
        dealId: match.dealId,
        fromEmail: normalizeEmail(m.from) ?? m.from.toLowerCase(),
        subject: m.subject.slice(0, 500),
        receivedAt: m.date,
        bodyText: m.text.slice(0, 20_000),
        classification: c.cls,
        classifiedBy: c.by,
      })
      .onConflictDoNothing()
      .returning({ id: inboundMessages.id });
    if (!row) continue;
    out.stored++;
    out.byClass[c.cls] = (out.byClass[c.cls] ?? 0) + 1;
    if (match.dealId) {
      await db.insert(activities).values({
        dealId: match.dealId,
        type: "email_in",
        at: m.date,
        payload: { inboundId: row.id, from: m.from, subject: m.subject, class: c.cls, snippet: ownText(m.text).slice(0, 300) },
      });
    }
    if (deps.effects !== false) await applyEffects(db, match, m, c.cls, deps.ai, now, deps.contact);
  }
  return out;
}

async function applyEffects(db: Db, match: Match, m: InboundMail, cls: ReplyClass, ai: AiConfig | null, now: Date, contact?: ContactOptions) {
  const dealId = match.dealId;
  if (cls === "out_of_office") return;
  if (cls === "bounce") {
    // The address does not work: never use it again; stop this sequence.
    if (match.draftId) {
      const [d] = await db.select({ to: drafts.toEmail }).from(drafts).where(eq(drafts.id, match.draftId)).limit(1);
      if (d) await addToDnc(db, { kind: "email", value: d.to, reason: "bounce (nedostavljivo)" });
    }
    if (dealId) {
      await dropOpenOutreach(db, dealId);
      await db.update(deals).set({ nextActionAt: null, updatedAt: now }).where(eq(deals.id, dealId));
    }
    return;
  }
  if (cls === "no") {
    await blockCompany(db, match.companyId, "odgovoril: ne / odjava", now);
    return;
  }
  if (!dealId) return;
  await dropOpenOutreach(db, dealId);
  if (cls === "not_now") {
    await db.update(deals).set({ stage: "nurture", nextActionAt: new Date(now.getTime() + 90 * 86_400_000), updatedAt: now }).where(eq(deals.id, dealId));
  } else {
    await db.update(deals).set({ stage: "replied", nextActionAt: null, updatedAt: now }).where(and(eq(deals.id, dealId), inArray(deals.stage, ["found", "researched", "contacted", "nurture"])));
  }
  // A reply draft for the owner (ADR-004: never sent without approval).
  const draft = await composeReply(db, match.companyId, m, cls, ai, contact);
  if (draft) {
    await db
      .insert(drafts)
      .values({ dealId, kind: "reply", toEmail: normalizeEmail(m.from)!, subject: draft.subject, body: draft.body, inReplyTo: m.messageId })
      .onConflictDoNothing();
  }
}

export async function listInbound(db: Db, limit = 100) {
  return db
    .select({
      id: inboundMessages.id,
      companyId: inboundMessages.companyId,
      companyName: companies.name,
      fromEmail: inboundMessages.fromEmail,
      subject: inboundMessages.subject,
      receivedAt: inboundMessages.receivedAt,
      bodyText: inboundMessages.bodyText,
      classification: inboundMessages.classification,
      classifiedBy: inboundMessages.classifiedBy,
      replyDraftStatus: sql<string | null>`(select d.status from drafts d where d.in_reply_to = ${inboundMessages.messageId} and d.status <> 'discarded' limit 1)`,
    })
    .from(inboundMessages)
    .innerJoin(companies, eq(companies.id, inboundMessages.companyId))
    .where(eq(inboundMessages.direction, "in"))
    .orderBy(sql`${inboundMessages.receivedAt} desc`)
    .limit(limit);
}

/** Everything written with one company, oldest first: CRM e-mails, the owner's own e-mails (Sent folder) and replies. */
export async function conversation(db: Db, companyId: string) {
  const sent = await db
    .select({ at: drafts.sentAt, subject: drafts.subject, body: drafts.body, kind: drafts.kind, to: drafts.toEmail })
    .from(drafts)
    .innerJoin(deals, eq(deals.id, drafts.dealId))
    .where(and(eq(deals.companyId, companyId), eq(drafts.status, "sent")));
  const mail = await db
    .select({ at: inboundMessages.receivedAt, subject: inboundMessages.subject, body: inboundMessages.bodyText, cls: inboundMessages.classification, direction: inboundMessages.direction, from: inboundMessages.fromEmail, to: inboundMessages.toEmails })
    .from(inboundMessages)
    .where(eq(inboundMessages.companyId, companyId));
  return [
    ...sent.map((s) => ({ dir: "out" as const, via: "crm" as const, at: s.at!, subject: s.subject, text: s.body, label: s.kind as string, who: s.to })),
    ...mail.map((g) =>
      g.direction === "out"
        ? { dir: "out" as const, via: "mail" as const, at: g.at, subject: g.subject, text: ownText(g.body), label: "ročno", who: g.to ?? "" }
        : { dir: "in" as const, via: "mail" as const, at: g.at, subject: g.subject, text: ownText(g.body), label: g.cls ?? "", who: g.from },
    ),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
}

export type SentResult = { seen: number; stored: number };

/**
 * Mail the owner sent from his own mail program (Sent folder, TASK-029): stored when a recipient belongs to a company.
 * CRM-sent mail is skipped (already a draft). A deal still at found/researched becomes "contacted".
 */
export async function processSent(db: Db, mails: InboundMail[], now = new Date()): Promise<SentResult> {
  const out: SentResult = { seen: mails.length, stored: 0 };
  for (const m of mails) {
    if (!m.messageId) continue;
    const [dup] = await db.select({ id: inboundMessages.id }).from(inboundMessages).where(eq(inboundMessages.messageId, m.messageId)).limit(1);
    if (dup) continue;
    const [ours] = await db.select({ id: drafts.id }).from(drafts).where(eq(drafts.messageId, m.messageId)).limit(1);
    if (ours) continue;
    let match: Match | null = null;
    for (const to of m.to ?? []) {
      match = await matchAddress(db, to);
      if (match) break;
    }
    if (!match) continue;
    const [row] = await db
      .insert(inboundMessages)
      .values({
        messageId: m.messageId,
        companyId: match.companyId,
        dealId: match.dealId,
        direction: "out",
        fromEmail: normalizeEmail(m.from) ?? m.from.toLowerCase(),
        toEmails: (m.to ?? []).join(", ").slice(0, 1000),
        subject: m.subject.slice(0, 500),
        receivedAt: m.date,
        bodyText: m.text.slice(0, 20_000),
        classification: null,
        classifiedBy: "owner",
      })
      .onConflictDoNothing()
      .returning({ id: inboundMessages.id });
    if (!row) continue;
    out.stored++;
    if (match.dealId) {
      await db.insert(activities).values({ dealId: match.dealId, type: "email_out", at: m.date, payload: { manual: true, to: m.to, subject: m.subject } });
      await db
        .update(deals)
        .set({ stage: "contacted", updatedAt: now })
        .where(and(eq(deals.id, match.dealId), inArray(deals.stage, ["found", "researched"])));
    }
  }
  return out;
}
