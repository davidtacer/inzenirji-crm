import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { createFirstDraft } from "../outreach/drafts";
import { runAudit } from "../research/run";
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

describe("createManualCompany", () => {
  it("creates company + deal (source manual) + contact; same company again → existing one", async () => {
    const r = await createManualCompany(db, { ...EMPTY_PREFILL, name: "Test David", city: "Maribor", phone: "+386 41 222 333", email: " DTacer@Gmail.com " });
    expect(r).toMatchObject({ ok: true, existed: false });
    if (!r.ok) return;
    expect((await admin`select source, stage from deals`)[0]).toEqual({ source: "manual", stage: "found" });
    expect((await admin`select email, email_source from contacts`)[0]).toEqual({ email: "dtacer@gmail.com", email_source: "vnesel lastnik" });
    const again = await createManualCompany(db, { ...EMPTY_PREFILL, name: "Drugo ime", phone: "041 222 333" });
    expect(again).toEqual({ ok: true, id: r.id, existed: true });
    expect((await admin`select count(*)::int n from companies`)[0].n).toBe(1);

    // Research without a website or Google → group B; then a first draft can be prepared for the test.
    await runAudit(db, r.id, { resolve: async () => ["93.184.216.34"] });
    const d = await createFirstDraft(db, r.id);
    expect(d.ok).toBe(true);
  });

  it("validates name and e-mail", async () => {
    expect(await createManualCompany(db, { ...EMPTY_PREFILL, name: " " })).toEqual({ ok: false, message: "Vpiši ime podjetja." });
    expect(await createManualCompany(db, { ...EMPTY_PREFILL, name: "X d.o.o.", email: "ni-email" })).toEqual({ ok: false, message: "E-naslov ni veljaven." });
  });
});
