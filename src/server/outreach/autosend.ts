import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { deals, drafts } from "../db/schema";
import type { Mailer } from "../email/mailer";
import { toLocalInput } from "@/lib/time";
import type { AiConfig } from "../ai/remark";
import { createDueFollowUps } from "./drafts";
import { type OutreachConfig, type SendError, sendApprovedDraft } from "./send";

/*
 * Automatic follow-ups (ADR-043; owner: "Avtomatsko pošiljanje follow upov mi dodaj v settingse, da si sam vklopim").
 * Off by default. When on, a timer in the app process (every 10 min) prepares due follow-ups and sends one, on
 * weekdays between 08:00 and 17:00 Ljubljana time, through the same send path as a click: do-not-contact check,
 * daily cap, bounce stop, opt-out link. First e-mails and replies are never sent automatically (ADR-004).
 */

/** Weekdays 08:00–16:59 in Ljubljana. */
export function inSendWindow(now: Date): boolean {
  const local = toLocalInput(now); // YYYY-MM-DDTHH:mm
  const wd = new Date(`${local.slice(0, 10)}T00:00:00Z`).getUTCDay();
  const hour = Number(local.slice(11, 13));
  return wd >= 1 && wd <= 5 && hour >= 8 && hour < 17;
}

export type AutoSendResult = { status: "off" | "outside_window" | "nothing" | "sent" | "failed"; error?: SendError; draftId?: string };

export async function autoSendFollowUp(
  db: Db,
  opts: { enabled: boolean; mailer: Mailer; config: OutreachConfig; now?: Date; ai?: AiConfig | null },
): Promise<AutoSendResult> {
  const now = opts.now ?? new Date();
  if (!opts.enabled || !opts.config.enabled) return { status: "off" };
  if (!inSendWindow(now)) return { status: "outside_window" };
  await createDueFollowUps(db, now, opts.ai ?? null);
  // Oldest open follow-up of a deal that is still waiting for an answer; an approved one (e.g. stopped by the cap) first.
  const [d] = await db
    .select({ id: drafts.id, status: drafts.status })
    .from(drafts)
    .innerJoin(deals, eq(deals.id, drafts.dealId))
    .where(and(inArray(drafts.kind, ["followup_1", "followup_2"]), inArray(drafts.status, ["pending", "approved"]), eq(deals.stage, "contacted")))
    .orderBy(desc(drafts.status), asc(drafts.createdAt))
    .limit(1);
  if (!d) return { status: "nothing" };
  if (d.status === "pending") await db.update(drafts).set({ status: "approved", approvedAt: now }).where(and(eq(drafts.id, d.id), eq(drafts.status, "pending")));
  const r = await sendApprovedDraft(db, d.id, { mailer: opts.mailer, config: opts.config, now });
  return r.ok ? { status: "sent", draftId: d.id } : { status: "failed", error: r.error, draftId: d.id };
}

/** Timer in the app process (prod only, see instrumentation). Settings are read on every check, so the switch acts at once. */
export function startFollowUpAutoSend(db: Db, env: Record<string, string | undefined> = process.env) {
  let busy = false;
  const check = async () => {
    if (busy) return;
    busy = true;
    try {
      const { getSettings } = await import("../settings");
      const { outreachConfig } = await import("./send");
      const { createOutreachMailerFromEnv } = await import("../email/mailer");
      const st = await getSettings(db, env);
      if (!st.followUpAutoSend) return;
      const config = outreachConfig(st, env);
      if (!config.enabled) return;
      const { aiConfig } = await import("../ai/remark");
      const r = await autoSendFollowUp(db, { enabled: true, mailer: createOutreachMailerFromEnv(env), config, ai: aiConfig(st, env) });
      if (r.status === "sent" || r.status === "failed") console.log(`[followup] ${r.status}${r.error ? ` ${r.error}` : ""}`);
    } catch (e) {
      console.error("[followup] check failed:", e instanceof Error ? e.message.slice(0, 160) : "unknown");
    } finally {
      busy = false;
    }
  };
  setTimeout(check, 90_000);
  setInterval(check, 10 * 60_000).unref();
}
