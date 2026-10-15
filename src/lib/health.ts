export type HealthBody = { status: "ok"; sha: string };

/** Health payload. The DB check is added with the data layer (TASK-003). */
export function healthBody(env: Record<string, string | undefined> = process.env): HealthBody {
  return { status: "ok", sha: env.GIT_SHA?.trim() || "unknown" };
}
