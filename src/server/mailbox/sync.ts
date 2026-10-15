import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { mailboxState } from "../db/schema";
import { aiConfigFromEnv } from "../ai/remark";
import { fetchNewMail, imapConfigFromEnv } from "./imap";
import { processInbound, type ProcessResult } from "./process";

export type SyncStatus = { ok: true; result: ProcessResult; at: Date } | { ok: false; message: string; at: Date | null } | { ok: null; at: Date | null };

export async function lastSync(db: Db): Promise<Date | null> {
  const [s] = await db.select({ at: mailboxState.syncedAt }).from(mailboxState).where(eq(mailboxState.mailbox, "INBOX")).limit(1);
  return s?.at ?? null;
}

/** Reads the mailbox now; `minAgeMs` skips it when the last sync is more recent (page loads). */
export async function syncMailbox(db: Db, opts: { minAgeMs?: number } = {}): Promise<SyncStatus> {
  const cfg = imapConfigFromEnv();
  const at = await lastSync(db);
  if (!cfg || !cfg.host) return { ok: false, message: "Nabiralnik ni nastavljen (OUTREACH_SMTP_PASSWORD).", at };
  if (opts.minAgeMs && at && Date.now() - at.getTime() < opts.minAgeMs) return { ok: null, at };
  try {
    const mails = await fetchNewMail(db, cfg);
    const result = await processInbound(db, mails, { ai: aiConfigFromEnv() });
    return { ok: true, result, at: new Date() };
  } catch (e) {
    console.error("[mailbox] sync failed:", e instanceof Error ? e.message : "unknown");
    return { ok: false, message: "Branje nabiralnika ni uspelo (prijava ali povezava). Poskusi znova čez minuto.", at };
  }
}
