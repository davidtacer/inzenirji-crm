import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { companies, deals } from "../db/schema";
import { companyDetail, researchBatch, runAudit } from "./run";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 4 });
const resolve = async () => ["93.184.216.34"];

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies, api_calls RESTART IDENTITY CASCADE");
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
    // Second research: location is known now, only the nearby call is made.
    const again: string[] = [];
    await runAudit(db, ana.id, { resolve, places: { apiKey: "K", dailyCap: 10, fetchImpl: places(again) } });
    expect(again.every((c) => c.includes("searchNearby"))).toBe(true);
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
