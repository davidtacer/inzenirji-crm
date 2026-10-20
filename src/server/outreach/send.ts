import { and, eq, gte, sql } from "drizzle-orm";
import { isBlocked } from "../contact/dnc";
import type { Db } from "../db/client";
import { activities, companies, deals, drafts } from "../db/schema";
import type { Mail, Mailer } from "../email/mailer";
import { localDay } from "../places/quota";
import { toHtml } from "./compose";
import { unsubscribeToken } from "./unsubscribe";
import type { Settings } from "../settings";
import { onDraftSent } from "../projects/projects";

/*
 * The one choke point for outbound e-mail (architecture "Safety", ADR-004, ADR-007, ADR-013).
 * Every send re-checks: switched on, approved, not on do-not-contact, under the daily cap.
 */

export type OutreachConfig = {
  /** OUTREACH_ENABLED=1 — the owner switches it on only after DKIM passes (ADR-013). */
  enabled: boolean;
  /** OUTREACH_DAILY_CAP — warm-up starts at 10 per day (ADR-013). */
  dailyCap: number;
  /** Sender mailbox, used for the mailto opt-out. */
  fromAddress: string;
  appUrl: string;
  secret: string;
};

export function outreachConfig(st: Settings, env: Record<string, string | undefined> = process.env): OutreachConfig {
  return {
    enabled: st.sendingEnabled && !!env.OUTREACH_SMTP_PASSWORD,
    dailyCap: st.dailySendCap,
    fromAddress: env.OUTREACH_SMTP_USER ?? "david@inzenirji.si",
    appUrl: env.APP_URL ?? "https://crm.inzenirji.si",
    secret: env.BETTER_AUTH_SECRET ?? "",
  };
}

/** Why sending is off, in Slovenian, or null when it is on. */
export function lockReason(st: Settings, env: Record<string, string | undefined> = process.env): string | null {
  if (!st.sendingEnabled) return "Pošiljanje je izklopljeno v Nastavitvah. Vklopi ga šele, ko pošta z david@inzenirji.si prestane DKIM (ADR-013).";
  if (!env.OUTREACH_SMTP_PASSWORD) return "Manjka geslo nabiralnika david@inzenirji.si (OUTREACH_SMTP_PASSWORD).";
  return null;
}

export type SendError = "NOT_FOUND" | "LOCKED" | "NOT_APPROVED" | "BLOCKED" | "CAP" | "BOUNCE_STOP" | "SEND_FAILED";

export const SEND_REASON: Record<SendError, string> = {
  NOT_FOUND: "Osnutka ni.",
  LOCKED: "Pošiljanje je zaklenjeno.",
  NOT_APPROVED: "Osnutek ni odobren.",
  BLOCKED: "Naslov je na seznamu »ne kontaktiraj« — osnutek je zavržen.",
  CAP: "Dosežena je današnja omejitev pošiljanja.",
  BOUNCE_STOP: "Pošiljanje novih e-mailov je ustavljeno: v zadnjih 7 dneh je več kot 3 % nedostavljenih (ADR-013). Preveri naslove.",
  SEND_FAILED: "Pošiljanje ni uspelo. Osnutek ostane odobren, poskusi kasneje.",
};

const NEXT_STEP_DAYS: Record<"first" | "followup_1" | "followup_2" | "reply", number | null> = { first: 3, followup_1: 5, followup_2: null, reply: null };

/** Bounce-rate stop (ADR-013): > 3 % bounces among ≥ 20 cold e-mails sent in the last 7 days. */
export async function bounceStop(db: Db, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [r] = (await db.execute(sql`select
      (select count(*)::int from drafts where status = 'sent' and kind::text <> 'reply' and sent_at >= ${since}) as sent,
      (select count(*)::int from inbound_messages where classification = 'bounce' and received_at >= ${since}) as bounces`)) as unknown as { sent: number; bounces: number }[];
  return r.sent >= 20 && r.bounces / r.sent > 0.03;
}

/** Start of today in Europe/Ljubljana as an instant. */
function startOfLocalDay(now: Date): Date {
  const day = localDay(now);
  // Offset of Ljubljana at this moment, in minutes.
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Ljubljana", timeZoneName: "longOffset" }).formatToParts(now);
  const off = parts.find((p) => p.type === "timeZoneName")?.value.match(/GMT([+-])(\d{2}):(\d{2})/);
  const minutes = off ? (off[1] === "-" ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3])) : 0;
  return new Date(Date.parse(`${day}T00:00:00Z`) - minutes * 60_000);
}

/** Cold e-mails sent today (replies to people who wrote to us do not count against the cap). */
export async function sentToday(db: Db, now = new Date()): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(drafts)
    .where(and(eq(drafts.status, "sent"), gte(drafts.sentAt, startOfLocalDay(now)), sql`${drafts.kind}::text <> 'reply'`));
  return r?.n ?? 0;
}

/** Today's cold e-mails split by kind, for the Osnutki page (owner 2026-10-20: "tu so not follow up emaili zraven"). */
export async function sentTodayByKind(db: Db, now = new Date()): Promise<{ first: number; followUps: number }> {
  const rows = await db
    .select({ kind: drafts.kind, n: sql<number>`count(*)::int` })
    .from(drafts)
    .where(and(eq(drafts.status, "sent"), gte(drafts.sentAt, startOfLocalDay(now)), sql`${drafts.kind}::text <> 'reply'`))
    .groupBy(drafts.kind);
  const n = (k: string) => rows.filter((r) => r.kind === k).reduce((a, r) => a + r.n, 0);
  return { first: n("first"), followUps: n("followup_1") + n("followup_2") };
}

export const messageIdFor = (draftId: string) => `<${draftId}@inzenirji.si>`;

export function buildMail(d: { id?: string; toEmail: string; subject: string; body: string; inReplyTo?: string | null }, cfg: OutreachConfig): Mail {
  const url = `${cfg.appUrl}/api/odjava?t=${unsubscribeToken(d.toEmail, cfg.secret)}`;
  return {
    to: d.toEmail,
    subject: d.subject,
    text: d.body,
    html: toHtml(d.body),
    ...(d.id ? { messageId: messageIdFor(d.id) } : {}),
    ...(d.inReplyTo ? { inReplyTo: d.inReplyTo, references: [d.inReplyTo] } : {}),
    headers: {
      "List-Unsubscribe": `<mailto:${cfg.fromAddress}?subject=odjava>, <${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

export async function sendApprovedDraft(
  db: Db,
  id: string,
  deps: { mailer: Mailer; config: OutreachConfig; now?: Date },
): Promise<{ ok: true } | { ok: false; error: SendError }> {
  const now = deps.now ?? new Date();
  const cfg = deps.config;
  if (!cfg.enabled) return { ok: false, error: "LOCKED" };
  return db.transaction(async (tx) => {
    // One send at a time, so the daily cap cannot be passed by two clicks.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('outreach_send'))`);
    const [d] = await tx
      .select({ draft: drafts, companyId: deals.companyId, stage: deals.stage })
      .from(drafts)
      .innerJoin(deals, eq(deals.id, drafts.dealId))
      .where(eq(drafts.id, id))
      .for("update", { of: drafts })
      .limit(1);
    if (!d) return { ok: false as const, error: "NOT_FOUND" as const };
    if (d.draft.status !== "approved" || !d.draft.approvedAt) return { ok: false as const, error: "NOT_APPROVED" as const };
    if (await isBlocked(tx as unknown as Db, { email: d.draft.toEmail, companyId: d.companyId })) {
      await tx.update(drafts).set({ status: "discarded" }).where(eq(drafts.id, id));
      return { ok: false as const, error: "BLOCKED" as const };
    }
    const cold = d.draft.kind !== "reply";
    if (cold && (await sentToday(tx as unknown as Db, now)) >= cfg.dailyCap) return { ok: false as const, error: "CAP" as const };
    if (cold && (await bounceStop(tx as unknown as Db, now))) return { ok: false as const, error: "BOUNCE_STOP" as const };
    try {
      await deps.mailer.send(buildMail(d.draft, cfg));
    } catch (e) {
      console.error("[outreach] send failed:", e instanceof Error ? e.message : "unknown");
      return { ok: false as const, error: "SEND_FAILED" as const };
    }
    await tx.update(drafts).set({ status: "sent", sentAt: now, messageId: messageIdFor(id) }).where(eq(drafts.id, id));
    // Sending some drafts triggers more (TASK-014): the project confirmation starts the guarantee clock.
    await onDraftSent(tx as unknown as Db, d.draft, now);
    const days = NEXT_STEP_DAYS[d.draft.kind];
    const early = d.stage === "found" || d.stage === "researched";
    if (cold) {
      await tx
        .update(deals)
        .set({
          ...(early ? { stage: "contacted" as const } : {}),
          nextActionAt: days === null ? null : new Date(now.getTime() + days * 86_400_000),
          updatedAt: now,
        })
        .where(eq(deals.companyId, d.companyId));
    }
    await tx.insert(activities).values({
      dealId: d.draft.dealId,
      type: "email_out",
      at: now,
      payload: { draftId: id, kind: d.draft.kind, to: d.draft.toEmail, subject: d.draft.subject },
    });
    await tx.update(companies).set({ updatedAt: now }).where(eq(companies.id, d.companyId));
    return { ok: true as const };
  });
}
