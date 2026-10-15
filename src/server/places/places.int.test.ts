import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { companies } from "../db/schema";
import type { Place } from "./client";
import { importPlaces } from "./import";
import { callsToday, QuotaError, reserveCall } from "./quota";
import { PLACES_PROVIDER, runPlacesSearch } from "./search";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 4 });

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

const place = (over: Partial<Place> = {}): Place => ({
  placeId: "p1",
  name: "Gostilna Primer",
  address: "Glavni trg 1, Maribor",
  city: "Maribor",
  phone: "02 123 45 67",
  website: "https://www.gostilna-primer.si",
  ratingX10: 46,
  reviewCount: 120,
  category: "Restavracija",
  mapsUrl: null,
  ...over,
});

describe("importPlaces", () => {
  it("creates a company with a found deal, and updates it on the next run", async () => {
    expect(await importPlaces(db, [place()])).toEqual({ created: 1, updated: 0 });
    expect(await importPlaces(db, [place({ reviewCount: 130 })])).toEqual({ created: 0, updated: 1 });
    const rows = await admin`select c.website_domain, c.review_count, d.stage, d.source from companies c join deals d on d.company_id = c.id`;
    expect(rows).toEqual([{ website_domain: "gostilna-primer.si", review_count: 130, stage: "found", source: "places_search" }]);
  });

  it("matches a manual company by domain or phone instead of duplicating", async () => {
    await db.insert(companies).values({ name: "Gostilna (ročno)", website: "gostilna-primer.si", websiteDomain: "gostilna-primer.si" });
    await db.insert(companies).values({ name: "Salon (ročno)", phone: "041 222 333" });
    const r = await importPlaces(db, [
      place(),
      place({ placeId: "p2", name: "Salon Primer", website: null, phone: "041222333" }),
    ]);
    expect(r).toEqual({ created: 0, updated: 2 });
    expect((await admin`select count(*)::int as n from companies`)[0].n).toBe(2);
    expect((await admin`select count(*)::int as n from deals`)[0].n).toBe(2);
  });

  it("never touches an existing deal", async () => {
    await importPlaces(db, [place()]);
    await admin`update deals set stage = 'contacted'`;
    await importPlaces(db, [place()]);
    expect((await admin`select stage from deals`)[0].stage).toBe("contacted");
  });
});

describe("daily cap", () => {
  it("reserves up to the cap, then refuses", async () => {
    expect(await reserveCall(db, "x", 2)).toBe(1);
    expect(await reserveCall(db, "x", 2)).toBe(2);
    await expect(reserveCall(db, "x", 2)).rejects.toBeInstanceOf(QuotaError);
    expect(await callsToday(db, "x")).toBe(2);
  });

  it("cannot be overshot by concurrent searches", async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => reserveCall(db, "y", 3)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await callsToday(db, "y")).toBe(3);
  });
});

describe("runPlacesSearch", () => {
  it("follows pages, stops at the cap, stores results", async () => {
    let n = 0;
    const fake = (async () => {
      n++;
      return new Response(
        JSON.stringify({
          places: [{ id: `id${n}`, displayName: { text: `Podjetje ${n}` }, businessStatus: "OPERATIONAL" }],
          nextPageToken: `t${n}`,
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const r = await runPlacesSearch(db, { query: "frizer Celje", pages: 3 }, { apiKey: "k", dailyCap: 2, fetchImpl: fake });
    expect(r).toEqual({ created: 2, updated: 0, found: 2, calls: 2, stoppedByQuota: true });
    expect(await callsToday(db, PLACES_PROVIDER)).toBe(2);
  });
});
