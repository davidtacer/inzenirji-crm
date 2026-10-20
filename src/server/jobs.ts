import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { jobs } from "./db/schema";

/*
 * Background jobs (TASK-035, ADR-037). Research with AI web search takes 1–2 minutes per company, longer than the
 * proxies wait for a response, so the request only starts the work and returns; the page shows the running job and
 * refreshes itself. Jobs run inside the app process; a deploy restart interrupts them, so a job still "running"
 * after STALE_MS is reported as interrupted.
 */

export const STALE_MS = 30 * 60_000;

export type JobKind = "research_one" | "research_batch" | "research_deepen" | "google_overview" | "weekly_report" | "smart_search" | "followups";
export type JobRow = typeof jobs.$inferSelect;
export type Progress = (p: { done: number; failed: number; total: number }) => Promise<void>;

/** Marks old running jobs as interrupted (the process that ran them is gone). */
async function sweep(db: Db, now: Date) {
  await db
    .update(jobs)
    .set({ status: "failed", message: "Prekinjeno (strežnik se je med raziskavo ponovno zagnal). Poženi znova.", finishedAt: now })
    .where(and(eq(jobs.status, "running"), lt(jobs.startedAt, new Date(now.getTime() - STALE_MS))));
}

/** The running job of this kind (and company), if any. */
export async function runningJob(db: Db, kinds: JobKind[], companyId?: string, now = new Date()): Promise<JobRow | null> {
  await sweep(db, now);
  const [j] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "running"), inArray(jobs.kind, kinds), companyId ? eq(jobs.companyId, companyId) : isNull(jobs.companyId)))
    .orderBy(desc(jobs.startedAt))
    .limit(1);
  return j ?? null;
}

/** The newest job of this kind (and company), running or finished within `withinMs`; for the status line. */
export async function latestJob(db: Db, kinds: JobKind[], companyId?: string, withinMs = 15 * 60_000, now = new Date()): Promise<JobRow | null> {
  await sweep(db, now);
  const [j] = await db
    .select()
    .from(jobs)
    .where(and(inArray(jobs.kind, kinds), companyId ? eq(jobs.companyId, companyId) : isNull(jobs.companyId), sql`${jobs.startedAt} > ${new Date(now.getTime() - withinMs).toISOString()}`))
    .orderBy(desc(jobs.startedAt))
    .limit(1);
  return j ?? null;
}

/**
 * Starts `work` without waiting for it. The returned id is stored at once; `work` reports progress and returns the
 * final message. Errors end the job as failed with a short message (details only in the log).
 */
export async function startJob(
  db: Db,
  input: { kind: JobKind; companyId?: string },
  work: (progress: Progress) => Promise<string>,
  onDone?: () => void,
): Promise<string> {
  const [j] = await db.insert(jobs).values({ kind: input.kind, companyId: input.companyId ?? null }).returning({ id: jobs.id });
  const id = j.id;
  const progress: Progress = async (p) => {
    await db.update(jobs).set({ done: p.done, failed: p.failed, total: p.total }).where(eq(jobs.id, id));
  };
  void (async () => {
    try {
      const message = await work(progress);
      await db.update(jobs).set({ status: "done", message, finishedAt: new Date() }).where(eq(jobs.id, id));
    } catch (e) {
      console.error(`[jobs] ${input.kind} failed:`, e instanceof Error ? e.message : "unknown");
      await db.update(jobs).set({ status: "failed", message: "Raziskava ni uspela. Poskusi znova.", finishedAt: new Date() }).where(eq(jobs.id, id));
    } finally {
      onDone?.();
    }
  })();
  return id;
}
