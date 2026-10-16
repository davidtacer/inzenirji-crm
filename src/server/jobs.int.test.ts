import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "./db/client";
import { runMigrations } from "./db/migrate";
import { companies, jobs } from "./db/schema";
import { latestJob, runningJob, STALE_MS, startJob } from "./jobs";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies, jobs RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

const settled = () => new Promise<void>((r) => setTimeout(r, 50));

describe("background jobs (TASK-035)", () => {
  it("returns at once, reports progress, ends with the work's message", async () => {
    const [c] = await db.insert(companies).values({ name: "X" }).returning();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let finished = false;
    await startJob(db, { kind: "research_one", companyId: c.id }, async (progress) => {
      await progress({ done: 0, failed: 0, total: 1 });
      await gate;
      return "Raziskano.";
    }, () => (finished = true));
    await settled();
    expect(await runningJob(db, ["research_one"], c.id)).toMatchObject({ status: "running", total: 1 });
    expect(await runningJob(db, ["research_one"])).toBeNull(); // company jobs are not global ones
    release();
    for (let i = 0; i < 20 && !finished; i++) await settled();
    expect(await latestJob(db, ["research_one"], c.id)).toMatchObject({ status: "done", message: "Raziskano." });
  });

  it("a failing job ends as failed; a stale running job is reported as interrupted", async () => {
    let finished = false;
    await startJob(db, { kind: "research_batch" }, async () => {
      throw new Error("boom");
    }, () => (finished = true));
    for (let i = 0; i < 20 && !finished; i++) await settled();
    expect(await latestJob(db, ["research_batch"])).toMatchObject({ status: "failed" });
    await db.insert(jobs).values({ kind: "research_deepen", startedAt: new Date(Date.now() - STALE_MS - 1000) });
    expect(await runningJob(db, ["research_deepen"])).toBeNull();
    expect(await latestJob(db, ["research_deepen"], undefined, STALE_MS * 2)).toMatchObject({ status: "failed", message: expect.stringContaining("Prekinjeno") });
  });
});
