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
      "calendar_events",
      "companies",
      "company_links",
      "competitor_links",
      "contacts",
      "deals",
      "do_not_contact",
      "draft_attachments",
      "drafts",
      "google_accounts",
      "held_inquiries",
      "inbound_messages",
      "jobs",
      "mailbox_state",
      "places_searches",
      "project_files",
      "project_pauses",
      "projects",
      "proposals",
      "session",
      "settings",
      "user",
      "verification",
      "weekly_reports",
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

describe("upgrade 0006 → 0007 with existing drafts (TASK-009)", () => {
  it("keeps drafts, adds 'reply', allows several replies per deal but one live step otherwise", async () => {
    const { mkdtempSync, cpSync, readFileSync, writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const dir = mkdtempSync(join(tmpdir(), "mig-"));
    mkdirSync(join(dir, "meta"));
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { idx: number; tag: string }[] };
    const old = journal.entries.filter((e) => e.idx <= 6);
    for (const e of old) cpSync(`drizzle/${e.tag}.sql`, join(dir, `${e.tag}.sql`));
    writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: old }));

    await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    const orm = drizzle(admin);
    await migrate(orm, { migrationsFolder: dir });
    const [c] = await admin`insert into companies (name) values ('A') returning id`;
    const [d] = await admin`insert into deals (company_id, source) values (${c.id}, 'manual') returning id`;
    await admin`insert into drafts (deal_id, kind, to_email, subject, body, status, approved_at, sent_at) values (${d.id}, 'first', 'a@b.si', 's', 'b', 'sent', now(), now())`;
    await admin`insert into drafts (deal_id, kind, to_email, subject, body) values (${d.id}, 'followup_1', 'a@b.si', 's', 'b')`;

    await migrate(orm, { migrationsFolder: "drizzle" });
    expect((await admin`select kind::text as kind from drafts order by kind`).map((r) => r.kind)).toEqual(["first", "followup_1"]);
    await admin`insert into drafts (deal_id, kind, to_email, subject, body, in_reply_to) values (${d.id}, 'reply', 'a@b.si', 's', 'b', '<1@x>'), (${d.id}, 'reply', 'a@b.si', 's', 'b', '<2@x>')`;
    await expect(admin`insert into drafts (deal_id, kind, to_email, subject, body) values (${d.id}, 'followup_1', 'a@b.si', 's', 'b')`).rejects.toThrow(/drafts_deal_kind_live_uq/);
    await expect(admin`insert into drafts (deal_id, kind, to_email, subject, body, in_reply_to) values (${d.id}, 'reply', 'a@b.si', 's', 'b', '<1@x>')`).rejects.toThrow(/drafts_in_reply_to_uq/);
  });
});
