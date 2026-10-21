import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addToDnc } from "../contact/dnc";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { audits, companies, contacts, deals } from "../db/schema";
import { rescoreCompany, rescoreMissing, topLeads } from "./apply";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });

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

async function researched(name: string, over: Partial<typeof companies.$inferInsert> = {}, stage: "researched" | "contacted" = "researched") {
  const [c] = await db.insert(companies).values({ name, ratingX10: 48, reviewCount: 120, phone: "041 111 222", ...over }).returning();
  await db.insert(deals).values({ companyId: c.id, source: "places_search", stage });
  await db.insert(audits).values({ companyId: c.id, data: { facts: null }, issues: [{ code: "no_website", severity: "high", text: "x" }], summary: `Povzetek ${name}` });
  return c;
}

describe("scoring in the database", () => {
  it("scores, lists top leads by score, skips contacted and blocked companies", async () => {
    const strong = await researched("Močan");
    await db.insert(contacts).values({ companyId: strong.id, email: "info@mocan.si", emailSource: "https://mocan.si" });
    const weak = await researched("Šibek", { ratingX10: 40, reviewCount: 5, phone: null });
    const done = await researched("Že kontaktiran", {}, "contacted");
    const blocked = await researched("Blokiran", { website: "https://blokiran.si", websiteDomain: "blokiran.si" });
    await addToDnc(db, { kind: "domain", value: "blokiran.si", reason: "odjava" });

    expect(await rescoreMissing(db)).toBe(4);
    const top = await topLeads(db);
    // Danes lists only e-mailable leads (owner 2026-10-21): "Šibek" has no address, a call-marked lead is left out too.
    expect(top.map((t) => t.name)).toEqual(["Močan"]);
    await db.insert(contacts).values({ companyId: weak.id, email: "info@sibek.si", emailSource: "x" });
    expect((await topLeads(db)).map((t) => t.name)).toEqual(["Močan", "Šibek"]);
    await admin`update deals set channel = 'call' where company_id = ${weak.id}`;
    await admin`update contacts set invalid_at = now() where company_id = ${strong.id}`;
    expect(await topLeads(db)).toHaveLength(0);
    await admin`update contacts set invalid_at = null where company_id = ${strong.id}`;
    expect(top[0].hasEmail).toBe(true);
    expect(top[0].summary).toBe("Povzetek Močan");
    expect((await admin`select score from companies where id = ${blocked.id}`)[0].score).toBe(0);
    expect((await admin`select score from companies where id = ${done.id}`)[0].score).toBeGreaterThan(0);
    expect(await rescoreMissing(db)).toBe(0);
  });

  it("returns null for a company without research", async () => {
    const [c] = await db.insert(companies).values({ name: "Neraziskan" }).returning();
    expect(await rescoreCompany(db, c.id)).toBeNull();
  });
});
