import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { companies, contacts, deals, inboundMessages, mailboxState } from "../db/schema";
import { websiteKind } from "../contact/website";
import { aiConfig } from "../ai/remark";
import { getSettings } from "../settings";
import { contactOptions } from "./reply";
import { fetchHistory, fetchNewMail, imapConfigFromEnv } from "./imap";
import { processInbound, processSent, type ProcessResult } from "./process";

export type SyncStatus =
  | { ok: true; result: ProcessResult; sentStored: number; at: Date }
  | { ok: false; message: string; at: Date | null }
  | { ok: null; at: Date | null };

export async function lastSync(db: Db): Promise<Date | null> {
  const [s] = await db.select({ at: mailboxState.syncedAt }).from(mailboxState).where(eq(mailboxState.mailbox, "INBOX")).limit(1);
  return s?.at ?? null;
}

/** Reads INBOX and Sent now; `minAgeMs` skips it when the last sync is more recent (page loads). */
export async function syncMailbox(db: Db, opts: { minAgeMs?: number } = {}): Promise<SyncStatus> {
  const cfg = imapConfigFromEnv();
  const at = await lastSync(db);
  if (!cfg || !cfg.host) return { ok: false, message: "Nabiralnik ni nastavljen (OUTREACH_SMTP_PASSWORD).", at };
  if (opts.minAgeMs && at && Date.now() - at.getTime() < opts.minAgeMs) return { ok: null, at };
  try {
    const { inbox, sent } = await fetchNewMail(db, cfg);
    const st = await getSettings(db);
    // Sent first: an owner's manual e-mail moves the deal to "contacted" before replies are handled.
    const s = await processSent(db, sent);
    const result = await processInbound(db, inbox, { ai: aiConfig(st), contact: contactOptions(st) });
    return { ok: true, result, sentStored: s.stored, at: new Date() };
  } catch (e) {
    console.error("[mailbox] sync failed:", e instanceof Error ? e.message : "unknown");
    return { ok: false, message: "Branje nabiralnika ni uspelo (prijava ali povezava). Poskusi znova čez minuto.", at };
  }
}

/** Addresses and own domain we search the mailbox for (TASK-029). */
export async function historyTerms(db: Db, companyId: string): Promise<string[]> {
  const [c] = await db.select({ domain: companies.websiteDomain }).from(companies).where(eq(companies.id, companyId)).limit(1);
  const emails = (await db.select({ e: contacts.email }).from(contacts).where(eq(contacts.companyId, companyId))).map((r) => r.e).filter((e): e is string => !!e);
  const terms = new Set(emails);
  if (c?.domain && websiteKind(c.domain) === "own") terms.add(`@${c.domain}`);
  return [...terms].slice(0, 10);
}

export type HistoryResult = { ok: true; inbound: number; sent: number } | { ok: false; message: string };

/**
 * Imports earlier correspondence of one company (last 365 days): stores and labels, without effects.
 * If they had already written back, an early-stage deal moves to "replied".
 */
export async function importCompanyHistory(db: Db, companyId: string, deps: { fetch?: typeof fetchHistory } = {}): Promise<HistoryResult> {
  const cfg = imapConfigFromEnv();
  if (!cfg || !cfg.host) return { ok: false, message: "Nabiralnik ni nastavljen." };
  const terms = await historyTerms(db, companyId);
  if (!terms.length) return { ok: false, message: "Podjetje nima e-naslova ali lastne domene za iskanje." };
  try {
    const { inbox, sent } = await (deps.fetch ?? fetchHistory)(cfg, terms);
    const st = await getSettings(db);
    const s = await processSent(db, sent);
    const r = await processInbound(db, inbox, { ai: aiConfig(st), effects: false });
    if (r.stored) {
      const [real] = await db
        .select({ id: inboundMessages.id })
        .from(inboundMessages)
        .where(and(eq(inboundMessages.companyId, companyId), eq(inboundMessages.direction, "in"), inArray(inboundMessages.classification, ["interested", "question", "not_now", "no"])))
        .limit(1);
      if (real) await db.update(deals).set({ stage: "replied", updatedAt: new Date() }).where(and(eq(deals.companyId, companyId), inArray(deals.stage, ["found", "researched", "contacted"])));
    }
    return { ok: true, inbound: r.stored, sent: s.stored };
  } catch (e) {
    console.error("[mailbox] history failed:", e instanceof Error ? e.message : "unknown");
    return { ok: false, message: "Branje nabiralnika ni uspelo. Poskusi znova čez minuto." };
  }
}
