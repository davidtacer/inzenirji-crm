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
