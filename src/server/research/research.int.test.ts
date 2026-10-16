import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { companies, deals } from "../db/schema";
import { companyDetail, listCompanies, parseCompanyQuery, researchBatch, runAudit, shallowCount } from "./run";
import { audits } from "../db/schema";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 4 });
const resolve = async () => ["93.184.216.34"];

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies, api_calls, ai_usage RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

async function company(values: Partial<typeof companies.$inferInsert> & { name: string }) {
  const [c] = await db.insert(companies).values({ city: "Celje", category: "Frizerski salon", ...values }).returning();
  await db.insert(deals).values({ companyId: c.id, source: "places_search" });
  return c;
}

const OLD_SITE = `<html><head><meta name="generator" content="WordPress 4.9"></head><body>
<a href="mailto:info@salon-ana.si">x</a> <a href="https://www.facebook.com/salonana">fb</a> © 2015</body></html>`;

describe("runAudit", () => {
  it("own old site → group A, issues, published e-mail with source, competitors, stage researched", async () => {
    const ana = await company({ name: "Salon Ana", website: "https://salon-ana.si", websiteDomain: "salon-ana.si", phone: "041 222 333", ratingX10: 47, reviewCount: 80 });
    await company({ name: "Salon Beta", ratingX10: 49, reviewCount: 120 });
    await company({ name: "Mesnica", category: "Mesnica" });
    const fake = (async () => new Response(OLD_SITE, { status: 200 })) as unknown as typeof fetch;
    const r = await runAudit(db, ana.id, { fetchImpl: fake, resolve, now: new Date("2026-10-15") });
    expect(r).toMatchObject({ group: "A", emails: 1, competitors: 1 });
    const d = (await companyDetail(db, ana.id))!;
    expect(d.stage).toBe("researched");
    expect(d.company.group).toBe("A");
    expect(d.contacts.map((c) => [c.email, c.emailSource])).toEqual([["info@salon-ana.si", "https://salon-ana.si/"]]);
    expect(d.competitors.map((c) => c.name)).toEqual(["Salon Beta"]);
    const codes = (d.audit!.issues as { code: string }[]).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["not_mobile", "old_year", "cms"]));
    expect(d.audit!.summary).toMatch(/^Skupina A/);
    // TASK-007: scored right after research.
    expect(r.score).toBeGreaterThan(0);
    expect(d.company.score).toBe(r.score);
    expect((d.company.scoreParts as { key: string }[]).map((p) => p.key)).toEqual(["business", "opportunity", "gap", "reach"]);
  });

  it("no website → group B without any fetch", async () => {
    const c = await company({ name: "Brez strani" });
    const boom = (async () => {
      throw new Error("must not fetch");
    }) as unknown as typeof fetch;
    const r = await runAudit(db, c.id, { fetchImpl: boom, resolve });
    expect(r.group).toBe("B");
    expect((await companyDetail(db, c.id))!.audit!.issues).toEqual([
      { code: "no_website", severity: "high", text: "Podjetje nima spletne strani." },
    ]);
  });

  it("unreachable own site → group B, error kept, never touches a later stage", async () => {
    const c = await company({ name: "Mrtva stran", website: "https://mrtva.si", websiteDomain: "mrtva.si" });
    await admin`update deals set stage = 'contacted'`;
    const fail = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const r = await runAudit(db, c.id, { fetchImpl: fail, resolve });
    expect(r.group).toBe("B");
    const d = (await companyDetail(db, c.id))!;
    expect(d.stage).toBe("contacted");
    expect((d.audit!.data as { fetchError: string }).fetchError).toBe("ECONNREFUSED");
  });
});

describe("researchBatch", () => {
  it("researches only found companies and counts failures", async () => {
    await company({ name: "A" });
    await company({ name: "B" });
    const c = await company({ name: "C" });
    await admin`update deals set stage = 'contacted' where company_id = ${c.id}`;
    const r = await researchBatch(db, { limit: 10, resolve });
    expect(r).toEqual({ done: 2, failed: 0 });
    const stages = await admin`select stage, count(*)::int as n from deals group by stage order by stage`;
    // Enum order = funnel order (found → researched → contacted).
    expect(stages).toEqual([{ stage: "researched", n: 2 }, { stage: "contacted", n: 1 }]);
  });
});

describe("nearby competitors (TASK-022)", () => {
  const nearbyResponse = {
    places: [
      { id: "self", displayName: { text: "Salon Ana" }, businessStatus: "OPERATIONAL", primaryType: "hair_care", location: { latitude: 46.23, longitude: 15.26 } },
      { id: "far", displayName: { text: "Salon Daleč" }, businessStatus: "OPERATIONAL", primaryType: "hair_care", location: { latitude: 46.245, longitude: 15.26 }, rating: 4.9, userRatingCount: 90 },
      { id: "near", displayName: { text: "Salon Blizu" }, businessStatus: "OPERATIONAL", primaryType: "hair_care", location: { latitude: 46.2305, longitude: 15.26 }, websiteUri: "https://blizu.si" },
    ],
  };
  const places = (calls: string[]) =>
    (async (u: string) => {
      calls.push(String(u));
      if (String(u).includes("searchNearby")) return new Response(JSON.stringify(nearbyResponse), { status: 200 });
      return new Response(JSON.stringify({ location: { latitude: 46.23, longitude: 15.26 }, primaryType: "hair_care" }), { status: 200 });
    }) as unknown as typeof fetch;

  it("good business: looks up its location once, stores neighbours as companies, nearest first", async () => {
    const ana = await company({ name: "Salon Ana", placeId: "self", ratingX10: 47, reviewCount: 80 });
    const calls: string[] = [];
    const r = await runAudit(db, ana.id, { resolve, places: { apiKey: "K", dailyCap: 10, fetchImpl: places(calls) } });
    expect(r.competitorSource).toBe("nearby");
    expect(calls.map((c) => (c.includes("searchNearby") ? "nearby" : "details"))).toEqual(["details", "nearby"]);
    const d = (await companyDetail(db, ana.id))!;
    expect(d.competitors.map((c) => [c.name, c.distanceM! < 100])).toEqual([
      ["Salon Blizu", true],
      ["Salon Daleč", false],
    ]);
    expect(d.company.lat).toBe(46.23);
    expect((await admin`select count(*)::int as n from companies`)[0].n).toBe(3);
    // Second research: one profile call (TASK-023) + nearby; location is not looked up separately.
    const again: string[] = [];
    await runAudit(db, ana.id, { resolve, places: { apiKey: "K", dailyCap: 10, fetchImpl: places(again) } });
    expect(again.map((c) => (c.includes("searchNearby") ? "nearby" : "details"))).toEqual(["details", "nearby"]);
  });

  it("not a good business or no quota left: falls back to the database, no Google call", async () => {
    const weak = await company({ name: "Šibek", placeId: "w1", ratingX10: 39, reviewCount: 10 });
    const calls: string[] = [];
    const r = await runAudit(db, weak.id, { resolve, places: { apiKey: "K", dailyCap: 10, fetchImpl: places(calls) } });
    expect(r.competitorSource).toBe("database");
    const good = await company({ name: "Dober", placeId: "g1", ratingX10: 48, reviewCount: 60, lat: 46.23, lng: 15.26, placeType: "hair_care" });
    await admin`insert into api_calls (provider, day, count) values ('google_places', ${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana" }).format(new Date())}, 10)`;
    const r2 = await runAudit(db, good.id, { resolve, places: { apiKey: "K", dailyCap: 10, fetchImpl: places(calls) } });
    expect(r2.competitorSource).toBe("database");
    expect(calls).toEqual([]);
  });
});

describe("deep research (TASK-023)", () => {
  const HOME = `<html><head><meta name="viewport" content="width=device-width"><title>Salon Ana</title></head><body>
<h1>Salon Ana</h1><a href="/kontakt/">Kontakt</a> <a href="https://salon-ana.si/o-nas">O nas</a> <a href="https://drug.si/kontakt">tuj</a>
<a href="/cenik.pdf">Cenik (kontakt)</a></body></html>`;
  const CONTACT = `<html><body><p>Pišite na info [at] salon-ana [dot] si ali
<a href="/cdn-cgi/l/email-protection#2b584a4744456b584a474445064a454a055842">[email&#160;protected]</a></p>
<p>Delovni čas:<br>Pon - Pet: 8:00 - 16:00<br>Sobota 8.00–12.00<br>Ned: zaprto</p><a href="tel:+386 41 222 333">tel</a></body></html>`;
  const ABOUT = `<html><body><p>Smo družinski salon od leta 1998.</p></body></html>`;
  const site = (urls: string[]) =>
    (async (u: string) => {
      urls.push(String(u));
      const path = new URL(String(u)).pathname;
      if (path.startsWith("/kontakt")) return new Response(CONTACT, { status: 200 });
      if (path.startsWith("/o-nas")) return new Response(ABOUT, { status: 200 });
      return new Response(HOME, { status: 200 });
    }) as unknown as typeof fetch;
  const profile = (status = "OPERATIONAL") =>
    (async (u: string) => {
      if (String(u).includes("searchNearby")) return new Response(JSON.stringify({ places: [] }), { status: 200 });
      const day = (d: number, o: number, c: number) => ({ open: { day: d, hour: o, minute: 0 }, close: { day: d, hour: c, minute: 0 } });
      return new Response(
        JSON.stringify({
          location: { latitude: 46.23, longitude: 15.26 },
          primaryType: "hair_care",
          businessStatus: status,
          editorialSummary: { text: "Prijazen frizerski salon." },
          regularOpeningHours: { periods: [1, 2, 3, 4, 5].map((d) => day(d, 8, 16)).concat([day(6, 8, 13)]), weekdayDescriptions: ["ponedeljek: 08:00–16:00"] },
          reviews: [{ rating: 5, originalText: { text: "Odlična frizerka Ana!" }, relativePublishTimeDescription: "pred mesecem" }, { rating: 4, text: { text: "" } }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

  it("reads contact/about pages on the same site, finds hidden e-mails with their page, compares hours with Google", async () => {
    const ana = await company({ name: "Salon Ana", website: "https://salon-ana.si", websiteDomain: "salon-ana.si", placeId: "p1", phone: "041 222 333", ratingX10: 48, reviewCount: 90 });
    const urls: string[] = [];
    const r = await runAudit(db, ana.id, { fetchImpl: site(urls), resolve, places: { apiKey: "K", dailyCap: 10, fetchImpl: profile() } });
    expect(urls).toEqual(["https://salon-ana.si/", "https://salon-ana.si/kontakt", "https://salon-ana.si/o-nas"]);
    expect(r.emails).toBe(2);
    const d = (await companyDetail(db, ana.id))!;
    expect(d.contacts.map((c) => [c.email, c.emailSource]).sort()).toEqual([
      ["info@salon-ana.si", "https://salon-ana.si/kontakt"],
      ["salon@salon-ana.si", "https://salon-ana.si/kontakt"],
    ]);
    const issues = d.audit!.issues as { code: string; text: string }[];
    expect(issues[0]).toEqual({ code: "hours_mismatch", severity: "high", text: "Na strani piše, da ste ob sobotah odprti do 12h, na Googlu pa do 13h." });
    expect(issues.map((i) => i.code)).not.toContain("phone_mismatch");
    const data = d.audit!.data as { google: { summary: string; reviews: unknown[] }; scanned: unknown[]; siteText: string };
    expect(data.google.summary).toBe("Prijazen frizerski salon.");
    expect(data.google.reviews).toEqual([{ rating: 5, text: "Odlična frizerka Ana!", when: "pred mesecem" }]);
    expect(data.scanned).toHaveLength(3);
    expect(data.siteText).toContain("družinski salon");
    expect(d.company.lat).toBe(46.23);
  });

  it("permanently closed on Google → closed issue and score 0", async () => {
    const c = await company({ name: "Zaprt", placeId: "p2", ratingX10: 47, reviewCount: 70 });
    await runAudit(db, c.id, { resolve, places: { apiKey: "K", dailyCap: 10, fetchImpl: profile("CLOSED_PERMANENTLY") } });
    const d = (await companyDetail(db, c.id))!;
    expect((d.audit!.issues as { code: string }[])[0].code).toBe("closed");
    expect(d.company.score).toBe(0);
  });
});

describe("deepen (TASK-023)", () => {
  it("re-researches only researched companies with the old homepage-only audit", async () => {
    const old = await company({ name: "Star" });
    await admin`update deals set stage = 'researched' where company_id = ${old.id}`;
    await db.insert(audits).values({ companyId: old.id, data: {}, issues: [] });
    const fresh = await company({ name: "Nov" });
    await runAudit(db, fresh.id, { resolve });
    await company({ name: "Neraziskan" });
    expect(await shallowCount(db)).toBe(1);
    expect(await researchBatch(db, { deepen: true, resolve })).toEqual({ done: 1, failed: 0 });
    expect(await shallowCount(db)).toBe(0);
    expect((await admin`select stage from deals d join companies c on c.id = d.company_id where c.name = 'Neraziskan'`)[0].stage).toBe("found");
  });
});

describe("directories (TASK-025)", () => {
  it("no own site: finds the company on bizi.si by address and stores the e-mail with the directory page as source", async () => {
    const c = await company({ name: "Fizioterapija Fizis", address: "Cesta proletarskih brigad 79, 2000 Maribor, Slovenija", website: "https://facebook.com/fizis", websiteDomain: "facebook.com" });
    const seen: string[] = [];
    const fake = (async (u: string) => {
      const url = new URL(String(u));
      seen.push(url.pathname + url.search);
      if (url.pathname === "/iskanje")
        return new Response(`<a href="https://www.bizi.si/FIZIS-D-O-O/">FIZIS d.o.o.</a><div>Cesta proletarskih brigad 79</div><div>2000 Maribor</div>`, { status: 200 });
      return new Response(`<h1>FIZIS d.o.o.</h1><a href="mailto:info@fizis.si">info@fizis.si</a>`, { status: 200 });
    }) as unknown as typeof fetch;
    const r = await runAudit(db, c.id, { fetchImpl: fake, resolve, directories: true });
    expect(seen).toEqual(["/iskanje?q=Cesta%20proletarskih%20brigad%2079%20Maribor", "/FIZIS-D-O-O/"]);
    expect(r).toMatchObject({ emails: 1, directoryEmails: 1 });
    const d = (await companyDetail(db, c.id))!;
    expect(d.contacts.map((x) => [x.email, x.emailSource])).toEqual([["info@fizis.si", "https://www.bizi.si/FIZIS-D-O-O/"]]);
    expect((d.audit!.data as { directory: { match: { legalName: string } } }).directory.match.legalName).toBe("FIZIS d.o.o.");
  });

  it("site already publishes an e-mail, or directories off → no directory request", async () => {
    const c = await company({ name: "Brez", address: "Glavni trg 1, 2000 Maribor" });
    const boom = (async () => {
      throw new Error("must not fetch");
    }) as unknown as typeof fetch;
    await runAudit(db, c.id, { fetchImpl: boom, resolve });
    expect((await companyDetail(db, c.id))!.contacts).toEqual([]);
  });
});

describe("company filters (TASK-030)", () => {
  it("search across name/e-mail/domain, stage, group, e-mail yes/no, own site, min score, sort, total", async () => {
    const { contacts: ct } = await import("../db/schema");
    const a = await company({ name: "Salon Fantazija", city: "Celje", group: "B", score: 83, ratingX10: 49, reviewCount: 260 });
    const b = await company({ name: "Frizoteka", city: "Celje", group: "A", website: "https://frizoteka.si", websiteDomain: "frizoteka.si", score: 60 });
    await company({ name: "Mesar", city: "Maribor", websiteDomain: "facebook.com", score: 20 });
    await db.insert(ct).values({ companyId: b.id, email: "info@frizoteka.si", emailSource: "x" });
    await admin`update deals set stage = 'researched' where company_id = ${a.id}`;
    const names = async (p: Record<string, string>) => (await listCompanies(db, parseCompanyQuery(p))).map((r) => r.name);
    expect(await names({ q: "fanta" })).toEqual(["Salon Fantazija"]);
    expect(await names({ q: "info@friz" })).toEqual(["Frizoteka"]);
    expect(await names({ q: "100%" })).toEqual([]);
    expect(await names({ stage: "researched" })).toEqual(["Salon Fantazija"]);
    expect(await names({ group: "A" })).toEqual(["Frizoteka"]);
    expect(await names({ email: "no", city: "celje" })).toEqual(["Salon Fantazija"]);
    expect(await names({ site: "own" })).toEqual(["Frizoteka"]);
    expect(await names({ site: "none" })).toEqual(["Salon Fantazija", "Mesar"]);
    expect(await names({ min: "50" })).toEqual(["Salon Fantazija", "Frizoteka"]);
    expect(await names({ sort: "name" })).toEqual(["Frizoteka", "Mesar", "Salon Fantazija"]);
    expect(await names({ f: "good" })).toEqual(["Salon Fantazija"]);
    expect((await listCompanies(db, { limit: 1 })).total).toBe(3);
    expect(parseCompanyQuery({ stage: "x", group: "C", min: "500", sort: "evil", source: "x" })).toEqual({});
    // Source: own demo deal, and an existing company that tried the demo later (note on its places_search deal).
    const demo = await db.insert(companies).values({ name: "primer.si" }).returning();
    await db.insert(deals).values({ companyId: demo[0]!.id, source: "editor_demo" });
    const [bd] = await admin`select id from deals where company_id = ${b.id}`;
    await admin`insert into activities (deal_id, type, payload) values (${bd!.id}, 'note', ${admin.json({ kind: "editor_demo", ref: "abc12345" })})`;
    expect((await names({ source: "editor_demo" })).sort()).toEqual(["Frizoteka", "primer.si"]);
    expect(await names({ source: "places_search", sort: "name" })).toEqual(["Frizoteka", "Mesar", "Salon Fantazija"]);
    const rows = await listCompanies(db, parseCompanyQuery({ sort: "name" }));
    expect(Object.fromEntries(rows.map((r) => [r.name, r.triedDemo]))).toEqual({ Frizoteka: true, Mesar: false, "primer.si": true, "Salon Fantazija": false });
  });
});

describe("web search (TASK-031)", () => {
  const answer = (text: string, searches = 2) =>
    (async () =>
      new Response(
        JSON.stringify({
          content: [
            { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "salon fantazija celje" } },
            { type: "web_search_tool_result", tool_use_id: "s1", content: [{ type: "web_search_result", url: "https://www.instagram.com/salonfantazija", title: "Salon Fantazija" }] },
            { type: "text", text },
          ],
          stop_reason: "end_turn",
          usage: { input_tokens: 10000, output_tokens: 400, server_tool_use: { web_search_requests: searches } },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
  const SITE = `<html><head><meta name="viewport" content="width=device-width"></head><body><h1>Salon Fantazija</h1>
<p>Miklošičeva 5, 3000 Celje · 031 241 241</p><a href="mailto:info@salonfantazija.si">info@salonfantazija.si</a></body></html>`;
  const sites = (opened: string[]) =>
    (async (u: string) => {
      opened.push(new URL(String(u)).hostname);
      if (String(u).includes("salonfantazija.si")) return new Response(SITE, { status: 200 });
      if (String(u).includes("najdi.si")) return new Response("<p>SALON FANTAZIJA, Miklošičeva ulica 5, 3000 Celje</p>", { status: 200 });
      return new Response("<p>nekaj drugega</p>", { status: 200 });
    }) as unknown as typeof fetch;
  const JSON_ANSWER = JSON.stringify({
    website: "https://www.salonfantazija.si",
    links: [
      { url: "https://www.instagram.com/salonfantazija", kind: "instagram", note: "@salonfantazija" },
      { url: "https://mikulickaja.wixsite.com/salon-fantazija", kind: "website", note: "stara Wix stran" },
      { url: "https://zemljevid.najdi.si/salon-fantazija", kind: "directory", note: "najdi.si" },
    ],
    emails: [{ email: "info@salonfantazija.si", source_url: "https://zemljevid.najdi.si/salon-fantazija" }, { email: "ines@gmail.com", source_url: "https://www.facebook.com/x" }],
    legal_name: "SALON FANTAZIJA, PTICA FANTAZIJE, D.O.O.",
    summary: "Frizerski salon v središču Celja.",
  });
  const ai = (fetchImpl: typeof fetch, budget = 1e6) => ({ apiKey: "K", model: "claude-sonnet-5-5", dailyBudgetMicroUsd: budget, fetchImpl });

  it("Google had no website: finds and verifies the real site, researches it, stores links, verified e-mail and a candidate", async () => {
    const c = await company({ name: "Frizerski salon FANTAZIJA", address: "Miklošičeva ulica 5, 3000 Celje, Slovenija", phone: "031 241 241", ratingX10: 49, reviewCount: 260 });
    const opened: string[] = [];
    const r = await runAudit(db, c.id, { resolve, fetchImpl: sites(opened), webSearch: true, ai: ai(answer(`Tukaj: ${JSON_ANSWER}`)) });
    expect(r.group).toBe("A");
    expect(r.web).toMatchObject({ website: "https://www.salonfantazija.si", emails: 1, candidates: 1 });
    const d = (await companyDetail(db, c.id))!;
    expect(d.company.websiteDomain).toBe("salonfantazija.si");
    expect(d.contacts.map((x) => x.email)).toEqual(["info@salonfantazija.si"]);
    expect(opened).not.toContain("www.instagram.com");
    const byKind = Object.fromEntries(d.links.map((l) => [l.url, [l.kind, l.source, l.verified]]));
    expect(byKind["https://www.instagram.com/salonfantazija"]).toEqual(["instagram", "web_search", false]);
    expect(byKind["https://zemljevid.najdi.si/salon-fantazija"]).toEqual(["directory", "web_search", true]);
    expect(byKind["https://mikulickaja.wixsite.com/salon-fantazija"]).toEqual(["other", "web_search", false]);
    expect(byKind["mailto:ines@gmail.com"]).toEqual(["email", "web_search", false]);
    expect((d.audit!.data as { web: { legalName: string } }).web.legalName).toBe("SALON FANTAZIJA, PTICA FANTAZIJE, D.O.O.");
    const [u] = await admin`select job, cost_micro_usd, ok from ai_usage`;
    expect(u).toEqual({ job: "web_search", cost_micro_usd: 20000 + 24000, ok: true });
  });

  it("AI researcher (TASK-034): domain from the Instagram bio shows »v izdelavi« → website kept, group B, profile, old Wix site, entity, facts", async () => {
    const c = await company({ name: "Frizerski salon FANTAZIJA", address: "Miklošičeva ulica 5, 3000 Celje, Slovenija", phone: "031 241 241", ratingX10: 49, reviewCount: 260 });
    const answerJson = JSON.stringify({
      website: null,
      website_from: null,
      other_sites: [{ url: "https://mikulickaja.wixsite.com/salon-fantazijaa", note: "stara stran na Wixu" }],
      profiles: [
        { kind: "instagram", url: "https://www.instagram.com/salonfantazija/", handle: "salonfantazija", followers: "2.888", bio: "Fantazija sredi Celja. Frizerski salon, ki uresničuje vaše fantazije.", website: "www.salonfantazija.si" },
      ],
      links: [{ url: "https://zemljevid.najdi.si/podjetje/salon-fantazija", kind: "directory", note: "najdi.si" }],
      entities: [{ name: "SALON FANTAZIJA, PTICA FANTAZIJE, D.O.O.", address: "Miklošičeva ulica 5, 3000 Celje", tax_id: null, source: "https://zemljevid.najdi.si/podjetje/salon-fantazija" }],
      emails: [{ email: "info@salonfantazija.si", source_url: "https://zemljevid.najdi.si/podjetje/salon-fantazija" }],
      phones: ["031 241 241"],
      people: [{ name: "Ines", role: "frizerka" }],
      services: ["striženje", "barvanje", "solna soba"],
      facts: ["osmo leto v Celju", "solna soba in aromaterapija"],
      summary: "Frizerski salon v središču Celja z 2.888 sledilci na Instagramu; domena salonfantazija.si je v izdelavi.",
    });
    const fetchSites = (async (u: string) => {
      const s = String(u);
      if (s.includes("salonfantazija.si")) return new Response("<html><body><h1>Stran je v izdelavi</h1><p>Kmalu.</p></body></html>", { status: 200 });
      if (s.includes("wixsite.com")) return new Response("<h1>O NAS | Salon Fantazija 1</h1><p>Celje</p>", { status: 200 });
      if (s.includes("najdi.si")) return new Response("<p>SALON FANTAZIJA, PTICA FANTAZIJE, D.O.O. Miklošičeva ulica 5, 3000 Celje 031 241 241 info@salonfantazija.si</p>", { status: 200 });
      return new Response("<p>nekaj drugega</p>", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await runAudit(db, c.id, { resolve, fetchImpl: fetchSites, webSearch: true, ai: ai(answer(answerJson, 6)) });
    expect(r.group).toBe("B");
    const d = (await companyDetail(db, c.id))!;
    expect(d.company.website).toBe("https://www.salonfantazija.si");
    expect(d.contacts.map((x) => [x.email, x.emailSource])).toEqual([["info@salonfantazija.si", "https://zemljevid.najdi.si/podjetje/salon-fantazija"]]);
    expect(d.audit!.issues).toEqual([expect.objectContaining({ code: "site_under_construction", severity: "high" })]);
    const web = (d.audit!.data as { web: Record<string, unknown> }).web;
    expect(web).toMatchObject({
      ok: true,
      error: null,
      website: "https://www.salonfantazija.si",
      websiteState: "under_construction",
      websiteFrom: "instagram",
      legalName: "SALON FANTAZIJA, PTICA FANTAZIJE, D.O.O.",
      facts: ["osmo leto v Celju", "solna soba in aromaterapija"],
    });
    expect(web.profiles).toEqual([expect.objectContaining({ kind: "instagram", followers: 2888, handle: "salonfantazija" })]);
    expect(web.otherSites).toEqual([expect.objectContaining({ url: "https://mikulickaja.wixsite.com/salon-fantazijaa", note: "stara stran na Wixu" })]);
  });

  it("a failed search says why (Anthropic error message), nothing else breaks", async () => {
    const c = await company({ name: "Salon Tretji", address: "Glavni trg 2, 3000 Celje", phone: "041 222 333" });
    const fail = (async () =>
      new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Web search is not enabled for this organization." } }), { status: 400 })) as unknown as typeof fetch;
    await runAudit(db, c.id, { resolve, fetchImpl: sites([]), webSearch: true, ai: ai(fail) });
    const d = (await companyDetail(db, c.id))!;
    expect((d.audit!.data as { web: { ok: boolean; error: string } }).web).toMatchObject({ ok: false, error: expect.stringContaining("Anthropic Console") });
  });

  it("a site that does not belong to the company is not used; budget used up → no search", async () => {
    const c = await company({ name: "Salon Drugi", address: "Glavni trg 1, 3000 Celje", phone: "041 000 000" });
    const wrong = JSON.stringify({ website: "https://www.drug-salon.si", links: [], emails: [{ email: "x@drug-salon.si", source_url: "https://www.drug-salon.si" }], legal_name: null, summary: null });
    await runAudit(db, c.id, { resolve, fetchImpl: sites([]), webSearch: true, ai: ai(answer(wrong)) });
    const d = (await companyDetail(db, c.id))!;
    expect(d.company.website).toBeNull();
    expect(d.contacts).toEqual([]);
    const spent = (await admin`select coalesce(sum(cost_micro_usd),0)::int s from ai_usage`)[0].s;
    const boom = (async () => {
      throw new Error("must not call");
    }) as unknown as typeof fetch;
    await runAudit(db, c.id, { resolve, fetchImpl: sites([]), webSearch: true, ai: ai(boom, spent) });
  });
});
