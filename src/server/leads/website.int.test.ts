import postgres from "postgres";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { companies, contacts, deals, drafts, inboundMessages } from "../db/schema";
import { createCaptureMailer } from "../email/mailer";
import { importWebsiteLead, parseWebsiteLead } from "./website";
import { guardLead, holdLead, listHeld, releaseHeld } from "./guard";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });
const T0 = new Date("2026-10-16T14:00:00Z");

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies, settings, held_inquiries RESTART IDENTITY CASCADE");
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
  it("guard (owner 2026-10-21): fake domain sent back, AI holds a joke, links and floods held, owner can release", async () => {
    const ok = async () => "yes" as const;
    const lead = parseWebsiteLead(body({ name: "AI SLOP", email: "claude@ai.slop", company: null, message: "Tako, ki ni AI slop." }), T0)!;
    expect(await guardLead(db, lead, { ai: null, checkDomain: async () => "no" })).toEqual({ action: "reject_email" });
    const prompts: string[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      prompts.push(String(init.body));
      return Response.json({ content: [{ type: "text", text: '{"verdict":"test","reason":"Šala, lažno ime in posmeh."}' }], usage: { input_tokens: 300, output_tokens: 20 } });
    }) as unknown as typeof fetch;
    const ai = { apiKey: "K", model: "claude-sonnet-5-5", dailyBudgetMicroUsd: 1_000_000, fetchImpl };
    const g = await guardLead(db, lead, { ai, checkDomain: ok, now: T0 });
    expect(g).toEqual({ action: "hold", verdict: "test", reason: "Šala, lažno ime in posmeh." });
    expect(JSON.parse(prompts[0]!)).toMatchObject({ model: "claude-haiku-5-5", output_config: { format: { type: "json_schema" } } });
    if (g.action !== "hold") return;
    await holdLead(db, lead, g);
    expect((await listHeld(db, T0)).map((h) => h.email)).toEqual(["claude@ai.slop"]);
    expect((await admin`select count(*)::int n from companies`)[0].n).toBe(0);

    const links = parseWebsiteLead(body({ message: "SEO https://a.com https://b.com https://c.com" }), T0)!;
    expect(await guardLead(db, links, { ai: null, checkDomain: ok, now: T0 })).toMatchObject({ action: "hold", verdict: "spam" });
    // A real, short question passes when AI says ok, and when AI fails.
    const real = parseWebsiteLead(body(), T0)!;
    const okAi = { ...ai, fetchImpl: (async () => Response.json({ content: [{ type: "text", text: '{"verdict":"ok","reason":"Pravo vprašanje."}' }], usage: {} })) as unknown as typeof fetch };
    expect(await guardLead(db, real, { ai: okAi, checkDomain: ok, now: T0 })).toEqual({ action: "accept" });
    const downAi = { ...ai, fetchImpl: (async () => new Response("x", { status: 500 })) as unknown as typeof fetch };
    expect(await guardLead(db, real, { ai: downAi, checkDomain: ok, now: T0 })).toEqual({ action: "accept" });

    // Released by the owner → a normal inquiry in the CRM.
    const [h] = await listHeld(db, T0);
    const r = await releaseHeld(db, h!.id, { ai: null, contact }, T0);
    expect(r?.created).toBe(true);
    expect(await listHeld(db, T0)).toHaveLength(0);
    expect((await admin`select count(*)::int n from inbound_messages where from_email = 'claude@ai.slop'`)[0].n).toBe(1);
  });

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
