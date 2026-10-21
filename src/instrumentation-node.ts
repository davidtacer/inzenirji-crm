// Apply migrations before serving traffic (ADR-011: migrations at container start).
export async function runStartupMigrations() {
  if (process.env.RUN_MIGRATIONS !== "1") return;
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is not set");
    process.exit(1);
  }
  const { runMigrations } = await import("./server/db/migrate");
  try {
    await runMigrations(url);
    console.log("[migrate] done");
  } catch (err) {
    console.error("[migrate] failed:", err instanceof Error ? err.message : "unknown error");
    process.exit(1);
  }
}

// Background timers in the app process (prod only: SCHEDULER=1): Monday 08:00 weekly report (TASK-016) and automatic
// follow-ups when the owner switches them on (ADR-043). WEEKLY_REPORT=1 is the older name of the same switch.
export async function startSchedulers() {
  if ((process.env.SCHEDULER !== "1" && process.env.WEEKLY_REPORT !== "1") || !process.env.DATABASE_URL) return;
  const { getDb } = await import("./server/db/client");
  const { startWeeklyReports } = await import("./server/reports/schedule");
  const { startFollowUpAutoSend } = await import("./server/outreach/autosend");
  startWeeklyReports(getDb(), { ...process.env, WEEKLY_REPORT: "1" });
  startFollowUpAutoSend(getDb());
  // Addresses of directories/portals that research added before ADR-044: marked invalid, their drafts cancelled.
  const { sweepForeignEmails } = await import("./server/contact/emails");
  sweepForeignEmails(getDb())
    .then((r) => console.log(`[emails] foreign addresses marked: ${r.marked}, drafts cancelled: ${r.drafts}`))
    .catch((e) => console.error("[emails] sweep failed:", e instanceof Error ? e.message.slice(0, 160) : "unknown"));
  // Bounces of the last 30 days that arrived before the CRM could match them (owner 2026-10-21); idempotent.
  setTimeout(async () => {
    try {
      const { imapConfigFromEnv, fetchRecentBounces } = await import("./server/mailbox/imap");
      const { processInbound } = await import("./server/mailbox/process");
      const cfg = imapConfigFromEnv();
      if (!cfg) return;
      const r = await processInbound(getDb(), await fetchRecentBounces(cfg), { ai: null });
      console.log(`[bounces] rescanned: ${r.seen}, matched: ${r.stored}`);
    } catch (e) {
      console.error("[bounces] rescan failed:", e instanceof Error ? e.message.slice(0, 160) : "unknown");
    }
  }, 60_000);
  console.log("[scheduler] weekly report + follow-ups on");
}
