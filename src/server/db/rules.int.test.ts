import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addToDnc, isBlocked } from "../contact/dnc";
import { createDb } from "./client";
import { runMigrations } from "./migrate";
import { companies, deals, drafts } from "./schema";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 2 });

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies, do_not_contact RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

async function newDeal() {
  const [c] = await db.insert(companies).values({ name: "Gostilna Primer", website: "https://gostilna-primer.si" }).returning();
  const [d] = await db.insert(deals).values({ companyId: c.id, source: "places_search" }).returning();
  return { company: c, deal: d };
}

/** postgres-js wraps constraint errors; drizzle puts them in `cause`. */
function constraintOf(e: unknown): string | undefined {
  const err = e as { constraint_name?: string; cause?: { constraint_name?: string } };
  return err.constraint_name ?? err.cause?.constraint_name;
}

describe("database rules", () => {
  it("allows one deal per company", async () => {
    const { company } = await newDeal();
    const e = await db.insert(deals).values({ companyId: company.id, source: "manual" }).catch((x) => x);
    expect(constraintOf(e)).toBe("deals_company_uq");
  });

  it("refuses a sent draft that was never approved (ADR-004)", async () => {
    const { deal } = await newDeal();
    const e = await db
      .insert(drafts)
      .values({ dealId: deal.id, toEmail: "info@gostilna-primer.si", subject: "s", body: "b", status: "sent", sentAt: new Date() })
      .catch((x) => x);
    // Both approval checks forbid this row; Postgres reports whichever it evaluates first.
    expect(["drafts_sent_requires_approval", "drafts_approved_has_time"]).toContain(constraintOf(e));
  });

  it("accepts a sent draft with approval time", async () => {
    const { deal } = await newDeal();
    const now = new Date();
    const [d] = await db
      .insert(drafts)
      .values({ dealId: deal.id, toEmail: "info@gostilna-primer.si", subject: "s", body: "b", status: "sent", approvedAt: now, sentAt: now })
      .returning();
    expect(d.status).toBe("sent");
  });

  it("refuses an e-mail contact without a source (ADR-007)", async () => {
    const { company } = await newDeal();
    const e = await admin`insert into contacts (company_id, email) values (${company.id}, 'info@x.si')`.catch((x) => x);
    expect(constraintOf(e)).toBe("contacts_email_has_source");
  });
});

describe("do-not-contact", () => {
  it("blocks by e-mail, domain and company; is case-insensitive", async () => {
    const { company } = await newDeal();
    expect(await isBlocked(db, { email: "Info@Gostilna-Primer.si", companyId: company.id })).toBe(false);

    await addToDnc(db, { kind: "email", value: "INFO@gostilna-primer.si", reason: "odjava" });
    expect(await isBlocked(db, { email: "info@gostilna-primer.si" })).toBe(true);
    expect(await isBlocked(db, { email: "ana@gostilna-primer.si" })).toBe(false);

    await addToDnc(db, { kind: "domain", value: "https://www.Gostilna-Primer.si", reason: "ne" });
    expect(await isBlocked(db, { email: "ana@gostilna-primer.si" })).toBe(true);

    expect(await isBlocked(db, { email: "x@drugo.si", companyId: company.id })).toBe(false);
    await addToDnc(db, { kind: "company", value: company.id, reason: "ne" });
    expect(await isBlocked(db, { email: "x@drugo.si", companyId: company.id })).toBe(true);
  });

  it("is idempotent and treats unusable addresses as blocked", async () => {
    await addToDnc(db, { kind: "email", value: "a@b.si", reason: "1" });
    await addToDnc(db, { kind: "email", value: "A@B.si", reason: "2" });
    const n = await admin`select count(*)::int as n from do_not_contact`;
    expect(n[0].n).toBe(1);
    expect(await isBlocked(db, { email: "not-an-address" })).toBe(true);
  });
});
