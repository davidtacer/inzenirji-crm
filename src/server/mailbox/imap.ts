import { ImapFlow, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { mailboxState } from "../db/schema";
import type { InboundMail } from "./classify";

/*
 * IMAP reader for david@inzenirji.si (TASK-009, Sent folder + history in TASK-029). Read-only: never deletes,
 * moves or flags. New mail: from the last seen UID per folder (first run: last 14 days), ≤ 200 per run.
 * History for one company: INBOX + Sent searched by its addresses/domain, last 365 days, ≤ 100 per folder.
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
  const addrs = (x: typeof p.to) => (Array.isArray(x) ? x : x ? [x] : []).flatMap((a) => a.value.map((v) => v.address ?? "")).filter(Boolean);
  return {
    messageId: p.messageId,
    from,
    to: [...addrs(p.to), ...addrs(p.cc)],
    subject: p.subject ?? "",
    text: withReportParts(p.text ?? (typeof p.html === "string" ? p.html.replace(/<[^>]+>/g, " ") : ""), p.attachments ?? []),
    date: p.date ?? new Date(),
    inReplyTo: p.inReplyTo ?? null,
    references: refs,
    autoSubmitted: typeof auto === "string" ? auto.toLowerCase() : null,
  };
}

/**
 * A bounce carries the failed recipient and our original Message-ID in its report parts (message/delivery-status,
 * message/rfc822, text/rfc822-headers), which mailparser treats as attachments. Their text is appended so the CRM can
 * match the bounce to the e-mail it returns (owner 2026-10-21: two bounces were not noticed).
 */
export function withReportParts(text: string, attachments: { contentType?: string; content?: Buffer }[]): string {
  const parts = attachments
    .filter((a) => /^(message\/(delivery-status|rfc822|global-delivery-status|global-headers)|text\/rfc822-headers)$/i.test(a.contentType ?? ""))
    .map((a) => (a.content ? a.content.toString("utf8").slice(0, 8000) : ""))
    .filter(Boolean);
  return parts.length ? `${text}\n\n${parts.join("\n\n")}` : text;
}

/** Bounces of the last `days` days in INBOX (also ones read before the CRM could match them). */
export async function fetchRecentBounces(cfg: ImapConfig, days = 30, now = new Date()): Promise<InboundMail[]> {
  const since = new Date(now.getTime() - days * 86_400_000);
  return withImap(cfg, async (client) => {
    await client.mailboxOpen("INBOX", { readOnly: true });
    const uids = (await client.search({ since, or: [{ from: "mailer-daemon" }, { from: "postmaster" }, { subject: "Undelivered" }] }, { uid: true })) || [];
    return (await readUids(client, uids.slice(-200))).mails;
  });
}

async function withImap<T>(cfg: ImapConfig, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 993,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

/** The Sent folder: special-use \Sent, else a usual name. */
export async function findSentFolder(client: ImapFlow): Promise<string | null> {
  const boxes = await client.list();
  const special = boxes.find((b) => b.specialUse === "\\Sent");
  if (special) return special.path;
  const names = ["Sent", "INBOX.Sent", "Sent Items", "Sent Messages", "Poslano", "INBOX.Poslano", "Poslana pošta"];
  return boxes.find((b) => names.some((n) => b.path.toLowerCase() === n.toLowerCase()))?.path ?? null;
}

async function readUids(client: ImapFlow, uids: number[]): Promise<{ mails: InboundMail[]; maxUid: number }> {
  const mails: InboundMail[] = [];
  let maxUid = 0;
  if (!uids.length) return { mails, maxUid };
  for await (const msg of client.fetch(uids, { source: true, uid: true }, { uid: true })) {
    if (msg.source) {
      const m = await toInbound(msg.source);
      if (m) mails.push(m);
    }
    maxUid = Math.max(maxUid, msg.uid);
  }
  return { mails, maxUid };
}

async function newInFolder(client: ImapFlow, db: Db, path: string, now: Date): Promise<InboundMail[]> {
  const box = await client.mailboxOpen(path, { readOnly: true });
  const validity = String(box.uidValidity);
  const [state] = await db.select().from(mailboxState).where(eq(mailboxState.mailbox, path)).limit(1);
  const lastUid = state && state.uidValidity === validity ? state.lastUid : 0;
  const range = lastUid > 0 ? { uid: `${lastUid + 1}:*` } : { since: new Date(now.getTime() - 14 * 86_400_000) };
  const uids = ((await client.search(range, { uid: true })) || []).filter((u) => u > lastUid).sort((a, b) => a - b).slice(0, 200);
  const { mails, maxUid } = await readUids(client, uids);
  const next = Math.max(lastUid, maxUid);
  await db
    .insert(mailboxState)
    .values({ mailbox: path, uidValidity: validity, lastUid: next, syncedAt: now })
    .onConflictDoUpdate({ target: mailboxState.mailbox, set: { uidValidity: validity, lastUid: next, syncedAt: now } });
  return mails;
}

export async function fetchNewMail(db: Db, cfg: ImapConfig, now = new Date()): Promise<{ inbox: InboundMail[]; sent: InboundMail[] }> {
  return withImap(cfg, async (client) => {
    const inbox = await newInFolder(client, db, "INBOX", now);
    const sentPath = await findSentFolder(client);
    const sent = sentPath ? await newInFolder(client, db, sentPath, now) : [];
    return { inbox, sent };
  });
}

/** IMAP search: any of the addresses/domains in From (INBOX) or To/Cc (Sent). */
function criteria(field: "from" | "to", terms: string[], since: Date): SearchObject {
  const ors: SearchObject[] = terms.flatMap((t): SearchObject[] => (field === "from" ? [{ from: t }] : [{ to: t }, { cc: t }]));
  return ors.length === 1 ? { since, ...ors[0] } : { since, or: ors };
}

export async function fetchHistory(cfg: ImapConfig, terms: string[], now = new Date()): Promise<{ inbox: InboundMail[]; sent: InboundMail[] }> {
  if (!terms.length) return { inbox: [], sent: [] };
  const since = new Date(now.getTime() - 365 * 86_400_000);
  return withImap(cfg, async (client) => {
    await client.mailboxOpen("INBOX", { readOnly: true });
    const inUids = ((await client.search(criteria("from", terms, since), { uid: true })) || []).slice(-100);
    const inbox = (await readUids(client, inUids)).mails;
    const sentPath = await findSentFolder(client);
    let sent: InboundMail[] = [];
    if (sentPath) {
      await client.mailboxOpen(sentPath, { readOnly: true });
      const outUids = ((await client.search(criteria("to", terms, since), { uid: true })) || []).slice(-100);
      sent = (await readUids(client, outUids)).mails;
    }
    return { inbox, sent };
  });
}
