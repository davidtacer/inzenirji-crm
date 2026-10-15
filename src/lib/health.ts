export type HealthBody = { status: "ok" | "error"; sha: string; db: "ok" | "error" };

export function buildSha(env: Record<string, string | undefined> = process.env): string {
  return env.GIT_SHA?.trim() || "unknown";
}

/**
 * Health with a bounded DB check. Never exposes error details.
 * `ping` runs `select 1` on the app database; injected so the logic is testable without a DB.
 */
export async function checkHealth(
  ping: () => Promise<unknown>,
  opts: { timeoutMs?: number; env?: Record<string, string | undefined> } = {},
): Promise<{ code: 200 | 503; body: HealthBody }> {
  const sha = buildSha(opts.env);
  const timeoutMs = opts.timeoutMs ?? 3000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ping(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    return { code: 200, body: { status: "ok", sha, db: "ok" } };
  } catch {
    return { code: 503, body: { status: "error", sha, db: "error" } };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
