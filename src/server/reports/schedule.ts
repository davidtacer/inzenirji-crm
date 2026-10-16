import { aiConfig } from "../ai/remark";
import { parseEmailList } from "../auth/emails";
import type { Db } from "../db/client";
import { demoFunnel } from "../demo/demo";
import { createMailerFromEnv } from "../email/mailer";
import { syncMailbox } from "../mailbox/sync";
import { getSettings } from "../settings";
import { dueWeek, isDue, makeReport, type ReportDeps, storedReport } from "./weekly";

/*
 * Monday 08:00 (Europe/Ljubljana) weekly report (TASK-016, ADR-040). A timer in the server process checks every
 * 10 minutes; the snapshot row is the record of what was sent, so restarts and several checks never send twice.
 * Only runs where WEEKLY_REPORT=1 (prod), never in tests or local runs.
 */

export function reportDeps(db: Db, env: Record<string, string | undefined> = process.env): Promise<ReportDeps> {
  return (async () => {
    const st = await getSettings(db, env);
    let mailer: ReportDeps["mailer"] = null;
    try {
      mailer = createMailerFromEnv(env);
    } catch {
      mailer = null;
    }
    return {
      ai: aiConfig(st, env),
      mailer,
      to: [...parseEmailList(env.OWNER_EMAILS)][0] ?? null,
      appUrl: env.APP_URL ?? "https://crm.inzenirji.si",
      editorStats: async (days: number) => {
        const f = await demoFunnel(db, undefined, days);
        return { stats: f.editor, error: f.error };
      },
    };
  })();
}

let running = false;

/** One check. Returns what it did, for logs and tests. */
export async function tick(db: Db, now: Date, deps: () => Promise<ReportDeps>): Promise<"not_due" | "already_sent" | "sent" | "failed"> {
  if (!isDue(now)) return "not_due";
  const ws = dueWeek(now);
  const old = await storedReport(db, ws);
  if (old?.sentAt) return "already_sent";
  // A failed send is retried at most once an hour.
  if (old?.sendError && now.getTime() - old.generatedAt.getTime() < 3600_000) return "failed";
  if (running) return "failed";
  running = true;
  try {
    // Pull the latest replies first, so they are counted.
    await syncMailbox(db, { minAgeMs: 10 * 60_000 }).catch(() => undefined);
    const r = await makeReport(db, ws, { ...(await deps()), now });
    return r.sentAt ? "sent" : "failed";
  } finally {
    running = false;
  }
}

export function startWeeklyReports(db: Db, env: Record<string, string | undefined> = process.env) {
  if (env.WEEKLY_REPORT !== "1") return;
  const check = () =>
    tick(db, new Date(), () => reportDeps(db, env))
      .then((r) => {
        if (r === "sent" || r === "failed") console.log(`[weekly] ${r}`);
      })
      .catch((e) => console.error("[weekly] check failed:", e instanceof Error ? e.message.slice(0, 160) : "unknown"));
  setTimeout(check, 60_000);
  setInterval(check, 10 * 60_000).unref();
}
