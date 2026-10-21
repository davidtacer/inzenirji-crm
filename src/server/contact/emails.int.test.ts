import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { callList } from "../calls/calllist";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { audits, companies, contacts, deals } from "../db/schema";
import { createCaptureMailer } from "../email/mailer";
import { approveDraft, createDueFollowUps, createFirstDraft, listDrafts } from "../outreach/drafts";
import { sendApprovedDraft, type OutreachConfig } from "../outreach/send";
import { parseResearch, verifyFindings, type WebFindings } from "../research/websearch";
import { emailBelongs, markEmailInvalid, sweepForeignEmails } from "./emails";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });
const cfg: OutreachConfig = { enabled: true, dailyCap: 10, fromAddress: "david@inzenirji.si", appUrl: "https://crm.test", secret: "s3cret" };
const T0 = new Date("2026-10-20T08:00:00Z");
const day = (n: number) => new Date(T0.getTime() + n * 86_400_000);

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

async function salon(name: string, emails: string[], extra: { website?: string } = {}) {
  const [c] = await db
    .insert(companies)
    .values({ name, city: "Celje", phone: "03 547 20 56", group: "B", category: "Frizerski salon", ratingX10: 48, reviewCount: 40, website: extra.website ?? null, websiteDomain: extra.website ? new URL(extra.website).hostname.replace(/^www\./, "") : null })
    .returning();
  await db.insert(deals).values({ companyId: c.id, source: "places_search", stage: "researched" });
  await db.insert(audits).values({ companyId: c.id, data: {}, issues: [{ code: "no_website", severity: "high", text: "Nima spletne strani." }], summary: "Frizerski salon v Celju, brez spletne strani." });
  for (const e of emails) await db.insert(contacts).values({ companyId: c.id, email: e, emailSource: "https://www.doberfrizer.si/celje/x" });
  return c;
}

describe("wrong e-mails and the phone channel (ADR-044)", () => {
  it("rule: own domain, free mail or a domain with the name; never a directory", () => {
    const c = { name: "Frizerski salon pri Slavici", website: null };
    expect(emailBelongs("info@doberfrizer.si", c)).toEqual({ ok: false, reason: "aggregator" });
    expect(emailBelongs("info@pirs.si", c)).toEqual({ ok: false, reason: "aggregator" });
    expect(emailBelongs("hello@toplocalplaces.com", c)).toEqual({ ok: false, reason: "aggregator" });
    expect(emailBelongs("info@nekaagencija.si", c)).toEqual({ ok: false, reason: "foreign_domain" });
    expect(emailBelongs("tjasamogu@gmail.com", c)).toEqual({ ok: true });
    expect(emailBelongs("salon@slavica.si", c)).toEqual({ ok: true });
    expect(emailBelongs("info@salon-ana.si", { name: "Salon Ana", website: "https://www.salon-ana.si" })).toEqual({ ok: true });
  });

  it("info@doberfrizer.si marked wrong → no planned e-mail, in the Za klic list", async () => {
    const c = await salon("Frizerski salon, Miha Ožek s.p.", ["info@doberfrizer.si"]);
    const r = await createFirstDraft(db, c.id);
    expect(r.ok).toBe(true);
    const res = await markEmailInvalid(db, c.id, "info@doberfrizer.si", "agregator (imenik, portal)", T0);
    expect(res.ok).toBe(true);
    expect((await admin`select status from drafts`).map((x) => x.status)).toEqual(["discarded"]);
    expect(await createFirstDraft(db, c.id)).toEqual({ ok: false, reason: "NO_EMAIL" });
    expect((await listDrafts(db)).pending).toHaveLength(0);
    // Kept (not deleted), so research cannot add it back as new.
    expect((await admin`select email, invalid_reason from contacts`)[0]).toEqual({ email: "info@doberfrizer.si", invalid_reason: "agregator (imenik, portal)" });
    await db.insert(contacts).values({ companyId: c.id, email: "info@doberfrizer.si", emailSource: "x" }).onConflictDoNothing();
    expect((await admin`select count(*)::int as n from contacts where invalid_at is null`)[0].n).toBe(0);
    const list = await callList(db, T0);
    expect(list.map((x) => [x.name, x.why, x.phone])).toEqual([["Frizerski salon, Miha Ožek s.p.", "no_email", "03 547 20 56"]]);
    expect(list[0].remark).toBe("Opazil sem, da nimate spletne strani - škoda, ker imate na Googlu odlične ocene (4,8 iz 40 mnenj).");
    expect(list[0].summary).toBe("Frizerski salon v Celju, brez spletne strani.");
  });

  it("after the first e-mail: marking stops follow-ups; another valid address can be chosen in the draft", async () => {
    const c = await salon("Salon Bor", ["info@pirs.si", "salonbor@gmail.com"]);
    const mailer = createCaptureMailer();
    const r = await createFirstDraft(db, c.id);
    if (!r.ok) throw new Error(r.reason);
    // Owner picks the gmail address in the drop-down.
    expect(await approveDraft(db, r.draftId, { subject: "S", body: "B", toEmail: "salonbor@gmail.com" }, T0)).toBe(true);
    expect((await sendApprovedDraft(db, r.draftId, { mailer, config: cfg, now: T0 })).ok).toBe(true);
    expect(mailer.sent[0].to).toBe("salonbor@gmail.com");
    expect(await createDueFollowUps(db, day(3))).toBe(1);
    await markEmailInvalid(db, c.id, "salonbor@gmail.com", "ne obstaja (vrnjen e-mail)", day(3));
    expect((await admin`select kind, status from drafts order by created_at`).map((x) => `${x.kind}:${x.status}`)).toEqual(["first:sent", "followup_1:discarded"]);
    await markEmailInvalid(db, c.id, "info@pirs.si", "agregator", day(3));
    expect(await createDueFollowUps(db, day(9))).toBe(0);
    expect((await callList(db, day(9))).map((x) => x.name)).toEqual(["Salon Bor"]);
  });

  it("a wrong recipient in the drop-down is refused", async () => {
    const c = await salon("Salon Cvet", ["cvet@gmail.com"]);
    const r = await createFirstDraft(db, c.id);
    if (!r.ok) throw new Error(r.reason);
    await expect(approveDraft(db, r.draftId, { subject: "S", body: "B", toEmail: "nekdo@drugje.si" }, T0)).rejects.toThrow("DRAFT_BAD_RECIPIENT");
  });

  it("clean-up at start marks directory addresses of not-yet-contacted leads and cancels their drafts", async () => {
    const a = await salon("Frizerstvo Las s.p.", ["info@pirs.si"]);
    const b = await salon("Salon Bamboo", ["bamboo@gmail.com", "info@visitcelje.eu"]);
    const ra = await createFirstDraft(db, a.id);
    expect(ra.ok).toBe(true);
    expect(await sweepForeignEmails(db, T0)).toEqual({ marked: 2, drafts: 1 });
    expect(await sweepForeignEmails(db, T0)).toEqual({ marked: 0, drafts: 0 });
    expect((await admin`select email from contacts where invalid_at is null`).map((x) => x.email)).toEqual(["bamboo@gmail.com"]);
    expect((await callList(db, T0)).map((x) => x.name)).toEqual(["Frizerstvo Las s.p."]);
    void b;
  });

  it("addresses from a page with several businesses and a directory taken as website are cleaned (owner 2026-10-21)", async () => {
    const c = await salon("Frizerski Salon Aleksandra, Aleksandra Lever S.P.", [], { website: "https://www1.ozs.si/katalog?ooz=13&page=16" });
    const src = "https://www1.ozs.si/katalog?ooz=13&page=16";
    for (const e of ["fulidoo@gmail.com", "goran.stegu@siol.net", "helena.catoric@gmail.com"]) await db.insert(contacts).values({ companyId: c.id, email: e, emailSource: src });
    // An own site with 3 own addresses stays.
    const own = await salon("Salon Ena", [], { website: "https://salonena.si" });
    for (const e of ["info@salonena.si", "ana@salonena.si", "salonena@gmail.com"]) await db.insert(contacts).values({ companyId: own.id, email: e, emailSource: "https://salonena.si/kontakt" });
    expect((await sweepForeignEmails(db, T0)).marked).toBe(3);
    expect((await admin`select count(*)::int n from contacts where company_id = ${c.id} and invalid_at is null`)[0].n).toBe(0);
    expect((await admin`select count(*)::int n from contacts where company_id = ${own.id} and invalid_at is null`)[0].n).toBe(3);
    expect((await admin`select website, website_domain from companies where id = ${c.id}`)[0]).toEqual({ website: null, website_domain: null });
  });

  it("manual 'pokliči' puts a company with an e-mail on the list too", async () => {
    const { setChannel } = await import("../calls/calllist");
    const c = await salon("Salon Dan", ["dan@gmail.com"]);
    expect(await callList(db, T0)).toEqual([]);
    await createFirstDraft(db, c.id);
    await setChannel(db, c.id, "call", T0);
    expect((await callList(db, T0)).map((x) => [x.name, x.why])).toEqual([["Salon Dan", "manual"]]);
    expect((await admin`select status from drafts`).map((x) => x.status)).toEqual(["discarded"]);
  });

  it("research: directory addresses dropped, a profile address verified, other pages only candidates", async () => {
    const pagesHtml: Record<string, string> = {
      "https://www.doberfrizer.si/celje/slavica": "<p>Frizerski salon Pri Slavici, Celje, 03 547 20 56</p><p>Kontakt portala: info@doberfrizer.si</p><p>tjasamogu@gmail.com</p>",
    };
    const fetchImpl = (async (u: string) => new Response(pagesHtml[String(u)] ?? "<p>x</p>", { status: 200 })) as unknown as typeof fetch;
    const p = parseResearch(
      JSON.stringify({
        profiles: [{ kind: "facebook", url: "https://www.facebook.com/people/Frizerski-salon-Pri-Slavici/100063486733971/" }],
        links: [{ url: "https://www.doberfrizer.si/celje/slavica", kind: "directory" }],
        emails: [
          { email: "info@doberfrizer.si", source_url: "https://www.doberfrizer.si/celje/slavica" },
          { email: "slavica.salon@gmail.com", source_url: "https://www.facebook.com/people/Frizerski-salon-Pri-Slavici/100063486733971/?sk=about" },
        ],
      }),
    )!;
    const base = { ok: false, error: null, website: null, links: [], emails: [], candidates: [] } as unknown as WebFindings;
    const w = await verifyFindings(
      { name: "Frizerski salon pri Slavici, Tjaša Mogu s.p.", category: "Frizer", address: null, city: "Celje", phone: "(03) 547 20 56", website: null, country: "SI" },
      p,
      base,
      { fetchImpl, resolve: async () => ["93.184.216.34"] },
    );
    expect(w.emails.map((e) => e.email)).toEqual(["slavica.salon@gmail.com"]);
    expect(w.candidates.map((e) => e.email)).toEqual(["tjasamogu@gmail.com"]);
    expect(JSON.stringify(w)).not.toContain("info@doberfrizer.si\",\"source");
  });
});
