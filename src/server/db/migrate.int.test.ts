import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate";

const url = process.env.TEST_DATABASE_URL!;
const journal = JSON.parse(fs.readFileSync(path.join(process.cwd(), "drizzle/meta/_journal.json"), "utf8"));
const MIGRATIONS = journal.entries.length as number;
const admin = postgres(url, { max: 1, onnotice: () => {} });

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
});

describe("migrations", () => {
  it("apply from zero and create the core tables", async () => {
    await runMigrations(url);
    const t = await admin`select table_name from information_schema.tables where table_schema = 'public' order by 1`;
    expect(t.map((r) => r.table_name)).toEqual([
      "account",
      "activities",
      "ai_usage",
      "api_calls",
      "audits",
      "companies",
      "competitor_links",
      "contacts",
      "deals",
      "do_not_contact",
      "drafts",
      "session",
      "user",
      "verification",
    ]);
    const applied = await admin`select count(*)::int as n from drizzle.__drizzle_migrations`;
    expect(applied[0].n).toBe(MIGRATIONS);
  });

  it("are idempotent", async () => {
    await runMigrations(url);
    const applied = await admin`select count(*)::int as n from drizzle.__drizzle_migrations`;
    expect(applied[0].n).toBe(MIGRATIONS);
  });
});
