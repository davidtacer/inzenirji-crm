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

// Monday 08:00 weekly report e-mail (TASK-016). Only where WEEKLY_REPORT=1 (prod).
export async function startSchedulers() {
  if (process.env.WEEKLY_REPORT !== "1" || !process.env.DATABASE_URL) return;
  const { getDb } = await import("./server/db/client");
  const { startWeeklyReports } = await import("./server/reports/schedule");
  startWeeklyReports(getDb());
  console.log("[weekly] scheduler on");
}
