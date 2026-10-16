import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { companies, contacts, deals } from "../db/schema";
import { checkDemoToken, createDemoToken, demoFunnel, demoNotes, importDemoLead, parseDemoLead, recentDemoLeads } from "./demo";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-demo-leads-0123456789";

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies, settings RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

const payload = (over: Record<string, unknown> = {}) => ({
  ref: "a1b2c3d4e5f60718",
  email: "Ana@Salon-Ana.si",
  website: null,
  startedAt: "2026-10-16T10:00:00.000Z",
  emailAt: "2026-10-16T10:05:00.000Z",
  edits: [
    { request: "Dodaj ričet za 8,90 €", reply: "Dodano.", changed: true, at: "2026-10-16T10:01:00.000Z" },
    { request: "", reply: "x", changed: false, at: "" },
  ],
  ...over,
});

describe("demo leads (TASK-032)", () => {
  it("token: created, stored encrypted, checked; a new one replaces the old", async () => {
    const t1 = await createDemoToken(db);
    expect(t1).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [row] = await admin`select value from settings where key = 'demoLeadsToken'`;
    expect(JSON.stringify(row.value)).not.toContain(t1);
    expect(await checkDemoToken(db, `Bearer ${t1}`)).toBe(true);
    expect(await checkDemoToken(db, "Bearer " + "x".repeat(43))).toBe(false);
    expect(await checkDemoToken(db, null)).toBe(false);
    const t2 = await createDemoToken(db);
    expect(await checkDemoToken(db, `Bearer ${t1}`)).toBe(false);
    expect(await checkDemoToken(db, `Bearer ${t2}`)).toBe(true);
  });

  it("parses the payload and refuses bad ones", () => {
    const lead = parseDemoLead(payload())!;
    expect(lead.email).toBe("ana@salon-ana.si");
    expect(lead.edits).toHaveLength(1);
    expect(parseDemoLead(payload({ email: "nope" }))).toBeNull();
    expect(parseDemoLead(payload({ ref: "../x" }))).toBeNull();
    expect(parseDemoLead("x")).toBeNull();
  });

  it("creates company, editor_demo deal, contact and a note; idempotent per ref", async () => {
    const r = await importDemoLead(db, parseDemoLead(payload())!);
    expect(r).toMatchObject({ created: true, duplicate: false });
    const [c] = await db.select().from(companies);
    expect(c.name).toBe("salon-ana.si");
    const [d] = await db.select().from(deals);
    expect(d.source).toBe("editor_demo");
    expect(d.nextActionAt).not.toBeNull();
    const [ct] = await db.select().from(contacts);
    expect(ct).toMatchObject({ email: "ana@salon-ana.si", emailSource: "vpisal v demo urejevalnika" });
    expect((await demoNotes(db, c.id))[0]!.edits[0]!.request).toBe("Dodaj ričet za 8,90 €");
    expect(await importDemoLead(db, parseDemoLead(payload())!)).toMatchObject({ duplicate: true, companyId: c.id });
    expect((await recentDemoLeads(db))).toHaveLength(1);
  });

  it("free-mail address without website keeps the e-mail as name; known website or e-mail joins the company", async () => {
    await importDemoLead(db, parseDemoLead(payload({ email: "janez@gmail.com" }))!);
    expect((await db.select().from(companies))[0]!.name).toBe("janez@gmail.com");

    const [existing] = await db.insert(companies).values({ name: "Frizerstvo Maja", website: "https://maja.si", websiteDomain: "maja.si" }).returning();
    await db.insert(deals).values({ companyId: existing.id, source: "places_search", stage: "contacted" });
    const r = await importDemoLead(db, parseDemoLead(payload({ ref: "ffff0000ffff0000", email: "maja@gmail.com", website: "www.maja.si" }))!);
    expect(r).toMatchObject({ created: false, companyId: existing.id });
    const [d] = await db.select().from(deals).where(eq(deals.companyId, existing.id));
    expect(d.source).toBe("places_search"); // the original source stays
    expect((await recentDemoLeads(db)).map((x) => x.name).sort()).toEqual(["Frizerstvo Maja", "janez@gmail.com"]);
  });

  it("funnel: editor numbers with the token, CRM calls from demo deals", async () => {
    const r = await importDemoLead(db, parseDemoLead(payload())!);
    await admin`update deals set stage = 'call_booked' where company_id = ${r.companyId}`;
    expect((await demoFunnel(db)).error).toMatch(/Ključ/);
    const token = await createDemoToken(db);
    const fetchImpl = vi.fn(async (_u: string | URL | Request, init?: RequestInit) =>
      (init?.headers as Record<string, string>).Authorization === `Bearer ${token}`
        ? Response.json({ visits: 40, edited: 25, emails: 6, edits: 90, costMicros: 450000 })
        : new Response("{}", { status: 401 }),
    ) as unknown as typeof fetch;
    const f = await demoFunnel(db, "https://ed.test/", 30, fetchImpl);
    expect(f).toMatchObject({ editor: { visits: 40, emails: 6 }, calls: 1, leads: 1, won: 0, error: null });
    expect((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0]).toBe("https://ed.test/api/demo/stats?days=30");
  });
});
