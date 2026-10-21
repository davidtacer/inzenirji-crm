import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { updateCompanyDetails } from "./edit";
import { createManualCompany, EMPTY_PREFILL } from "./manual";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

describe("updateCompanyDetails", () => {
  it("renames a company created with the e-mail as its name and updates the details", async () => {
    const c = await createManualCompany(db, { ...EMPTY_PREFILL, name: "dejan.dego@gmail.com", phone: "070 812 542" });
    if (!c.ok) throw new Error(c.message);
    const r = await updateCompanyDetails(db, c.id, { name: "Dego", phone: "+386 70 812 542", address: "Prvomajska ulica 24, 2000 Maribor", city: "Maribor", website: "lotus4u.si", category: "" });
    expect(r).toEqual({ ok: true });
    const [row] = await admin`select name, phone, address, city, website, website_domain, category from companies`;
    expect(row).toEqual({ name: "Dego", phone: "+386 70 812 542", address: "Prvomajska ulica 24, 2000 Maribor", city: "Maribor", website: "https://lotus4u.si", website_domain: "lotus4u.si", category: null });
  });

  it("changes nothing on invalid input and reports a missing company", async () => {
    const c = await createManualCompany(db, { ...EMPTY_PREFILL, name: "Salon Ana" });
    if (!c.ok) throw new Error(c.message);
    expect(await updateCompanyDetails(db, c.id, { name: "", phone: "", address: "", city: "", website: "", category: "" })).toMatchObject({ ok: false });
    expect((await admin`select name from companies`)[0].name).toBe("Salon Ana");
    expect(await updateCompanyDetails(db, "00000000-0000-0000-0000-000000000000", { name: "X d.o.o.", phone: "", address: "", city: "", website: "", category: "" })).toEqual({ ok: false, message: "Podjetje ne obstaja." });
  });
});
