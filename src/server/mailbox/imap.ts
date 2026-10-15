import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { mailboxState } from "../db/schema";
import type { InboundMail } from "./classify";

/*
 * IMAP reader for david@inzenirji.si (TASK-009). Reads INBOX from the last seen UID (first run: last 14 days),
 * at most 200 messages per run, never deletes or changes flags (read-only open).
 */

export type ImapConfig = { host: string; port: number; user: string; password: string };

export function imapConfigFromEnv(env: Record<string, string | undefined> = process.env): ImapConfig | null {
  if (!env.OUTREACH_SMTP_PASSWORD || !env.OUTREACH_SMTP_USER) return null;
  return {
    host: env.OUTREACH_IMAP_HOST ?? env.OUTREACH_SMTP_HOST ?? env.SMTP_HOST ?? "",
    port: Number(env.OUTREACH_IMAP_PORT ?? 993),
    user: env.OUTREACH_SMTP_USER,
    password: env.OUTREACH_SMTP_PASSWORD,
  };
}

export async function toInbound(source: Buffer): Promise<InboundMail | null> {
  const p = await simpleParser(source);
  const from = p.from?.value?.[0]?.address;
  if (!p.messageId || !from) return null;
  const refs = Array.isArray(p.references) ? p.references : p.references ? [p.references] : [];
  const auto = p.headers.get("auto-submitted");
  return {
    messageId: p.messageId,
    from,
    subject: p.subject ?? "",
    text: p.text ?? (typeof p.html === "string" ? p.html.replace(/<[^>]+>/g, " ") : ""),
    date: p.date ?? new Date(),
    inReplyTo: p.inReplyTo ?? null,
    references: refs,
    autoSubmitted: typeof auto === "string" ? auto.toLowerCase() : null,
  };
}

export async function fetchNewMail(db: Db, cfg: ImapConfig, now = new Date()): Promise<InboundMail[]> {
  const client = new ImapFlow({ host: cfg.host, port: cfg.port, secure: cfg.port === 993, auth: { user: cfg.user, pass: cfg.password }, logger: false, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 60_000 });
  await client.connect();
  const out: InboundMail[] = [];
  try {
    const box = await client.mailboxOpen("INBOX", { readOnly: true });
    const validity = String(box.uidValidity);
    const [state] = await db.select().from(mailboxState).where(eq(mailboxState.mailbox, "INBOX")).limit(1);
    const lastUid = state && state.uidValidity === validity ? state.lastUid : 0;
    const range = lastUid > 0 ? { uid: `${lastUid + 1}:*` } : { since: new Date(now.getTime() - 14 * 86_400_000) };
    const uids = ((await client.search(range, { uid: true })) || []).filter((u) => u > lastUid).sort((a, b) => a - b).slice(0, 200);
    let maxUid = lastUid;
    if (uids.length) {
      for await (const msg of client.fetch(uids, { source: true, uid: true }, { uid: true })) {
        if (msg.source) {
          const m = await toInbound(msg.source);
          if (m) out.push(m);
        }
        maxUid = Math.max(maxUid, msg.uid);
      }
    }
    await db
      .insert(mailboxState)
      .values({ mailbox: "INBOX", uidValidity: validity, lastUid: maxUid, syncedAt: now })
      .onConflictDoUpdate({ target: mailboxState.mailbox, set: { uidValidity: validity, lastUid: maxUid, syncedAt: now } });
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}
