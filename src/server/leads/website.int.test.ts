import postgres from "postgres";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { companies, contacts, deals, drafts, inboundMessages } from "../db/schema";
import { createCaptureMailer } from "../email/mailer";
import { importWebsiteLead, parseWebsiteLead } from "./website";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });
const T0 = new Date("2026-10-16T14:00:00Z");

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

const body = (over: Record<string, unknown> = {}) => ({
  ref: "0f5e2c1a-7b3d-4e8f-9a10-112233445566",
  name: "Maja Novak",
  email: "Maja@Frizerstvo-Maja.si",
  phone: "041 123 456",
  company: "Frizerstvo Maja",
  message: "Ne vem točno, kaj potrebujem. Imamo staro stran in bi radi sami menjali cene.",
  page: "https://inzenirji.si/urejevalnik",
  newsletter: false,
  ...over,
});
const contact = { bookingUrl: "https://calendar.app.google/x", phone: "041 000 000" };

describe("website inquiries (TASK-033)", () => {
  it("parses and refuses bad payloads", () => {
    const l = parseWebsiteLead(body(), T0)!;
    expect(l).toMatchObject({ ref: "0f5e2c1a7b3d4e8f9a10112233445566", email: "maja@frizerstvo-maja.si", company: "Frizerstvo Maja" });
    expect(parseWebsiteLead(body({ email: "x" }))).toBeNull();
    expect(parseWebsiteLead(body({ name: "" }))).toBeNull();
    expect(parseWebsiteLead(body({ ref: "../" }))).toBeNull();
  });

  it("creates company, contact, deal; stores the inquiry as a message, deal replied, reply draft, notifies owner", async () => {
    const mailer = createCaptureMailer();
    const r = await importWebsiteLead(db, parseWebsiteLead(body(), T0)!, {
      ai: null,
      contact,
      notify: { mailer, to: "dtacer@gmail.com", appUrl: "https://crm.test" },
    });
    expect(r).toMatchObject({ created: true, duplicate: false });
    const [c] = await db.select().from(companies);
    expect(c).toMatchObject({ name: "Frizerstvo Maja", phone: "041 123 456" });
    const [ct] = await db.select().from(contacts);
    expect(ct).toMatchObject({ name: "Maja Novak", email: "maja@frizerstvo-maja.si", emailSource: "obrazec na inzenirji.si" });
    const [d] = await db.select().from(deals);
    expect(d).toMatchObject({ source: "website_form", stage: "replied" });
    const [m] = await db.select().from(inboundMessages);
    expect(m).toMatchObject({ classification: "interested", classifiedBy: "form", subject: "Vaše povpraševanje na inzenirji.si" });
    expect(m.bodyText).toContain("sami menjali cene");
    expect(m.bodyText).toContain("Telefon: 041 123 456");
    const [dr] = await db.select().from(drafts);
    expect(dr).toMatchObject({ kind: "reply", toEmail: "maja@frizerstvo-maja.si", status: "pending" });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: "dtacer@gmail.com", subject: "Novo povpraševanje: Frizerstvo Maja" });
    expect(mailer.sent[0]!.text).toContain(`https://crm.test/podjetja/${c.id}`);

    // The same inquiry again (retry) changes nothing.
    expect(await importWebsiteLead(db, parseWebsiteLead(body(), T0)!, { ai: null, contact })).toMatchObject({ duplicate: true, companyId: c.id });
    expect(await db.select().from(inboundMessages)).toHaveLength(1);
  });

  it("joins a known company by contact e-mail and keeps its source", async () => {
    const [c] = await db.insert(companies).values({ name: "Salon X" }).returning();
    await db.insert(deals).values({ companyId: c.id, source: "places_search", stage: "contacted" });
    await db.insert(contacts).values({ companyId: c.id, email: "info@salonx.si", emailSource: "x" });
    const r = await importWebsiteLead(db, parseWebsiteLead(body({ email: "info@salonx.si", company: "Drugo ime", ref: "aaaabbbbcccc" }), T0)!, { ai: null, contact });
    expect(r).toMatchObject({ created: false, companyId: c.id });
    const [d] = await db.select().from(deals).where(eq(deals.companyId, c.id));
    expect(d).toMatchObject({ source: "places_search", stage: "replied" });
  });

  it("free-mail without company: the e-mail is the name", async () => {
    await importWebsiteLead(db, parseWebsiteLead(body({ email: "janez@gmail.com", company: "", ref: "1234abcd" }), T0)!, { ai: null, contact });
    const [c] = await db.select().from(companies);
    expect(c).toMatchObject({ name: "janez@gmail.com", websiteDomain: null });
  });
});
