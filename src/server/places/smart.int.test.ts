import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { activityByKey, planQueries } from "./catalog";
import { runPlacesSearch } from "./search";
import { nextTowns, runSmartSearch, searchHistory } from "./smart";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies, api_calls, places_searches RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

/** Fake Google: each query has 3 pages of 20; page 1 of every query shares 15 places with "frizerski salon Celje". */
function google(log: { query: string; page: string | null }[]) {
  return (async (_u: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body)) as { textQuery: string; pageToken?: string };
    log.push({ query: b.textQuery, page: b.pageToken ?? null });
    const page = Number(b.pageToken ?? 0);
    const slug = b.textQuery.replace(/\W+/g, "-");
    const ids = Array.from({ length: 20 }, (_, i) => (page === 0 && i < 15 && b.textQuery !== "frizerski salon Celje" ? `shared-${i}` : page === 0 && b.textQuery === "frizerski salon Celje" && i < 15 ? `shared-${i}` : `${slug}-${page}-${i}`));
    return Response.json({
      places: ids.map((id) => ({ id, displayName: { text: `Salon ${id}` }, businessStatus: "OPERATIONAL", formattedAddress: "Celje" })),
      ...(page < 2 ? { nextPageToken: String(page + 1) } : {}),
    });
  }) as unknown as typeof fetch;
}

describe("smart search (owner 2026-10-19)", () => {
  it("plans synonyms, city parts and the region's towns, best first", () => {
    const q = planQueries(activityByKey("frizer")!, "Celje", true).map((x) => x.query);
    expect(q.slice(0, 5)).toEqual(["frizerski salon Celje", "frizer Celje", "frizerka Celje", "frizerski studio Celje", "barber Celje"]);
    expect(q).toContain("frizerski salon Celje Hudinja");
    expect(q).toContain("frizerski salon Žalec");
    expect(q).toContain("frizer Šentjur");
    expect(planQueries(activityByKey("frizer")!, "Celje", false).some((x) => x.query.includes("Žalec"))).toBe(false);
  });

  it("reads more pages only while they bring new companies, keeps the budget, skips what was searched", async () => {
    const log: { query: string; page: string | null }[] = [];
    const r = await runSmartSearch(db, { activity: "frizer", town: "Celje", nearby: false, budget: 5 }, { apiKey: "k", dailyCap: 100, fetchImpl: google(log) });
    // Query 1: all 20 new → page 2 (20 new) → page 3. Query 2: 15 of 20 already known → no page 2.
    expect(log.slice(0, 4)).toEqual([
      { query: "frizerski salon Celje", page: null },
      { query: "frizerski salon Celje", page: "1" },
      { query: "frizerski salon Celje", page: "2" },
      { query: "frizer Celje", page: null },
    ]);
    expect(r).toMatchObject({ calls: 5, queries: 3, created: 60 + 5 + 5, stoppedByQuota: false });
    expect(r.left).toBeGreaterThan(0);
    const again: typeof log = [];
    const r2 = await runSmartSearch(db, { activity: "frizer", town: "Celje", nearby: false, budget: 2 }, { apiKey: "k", dailyCap: 100, fetchImpl: google(again) });
    expect(again[0]!.query).toBe("frizerski studio Celje");
    expect(r2.skipped).toBe(3);
    const h = await searchHistory(db);
    expect(h[0]).toMatchObject({ activity: "frizer", town: "Celje", queries: 5 });
    expect(await nextTowns(db, "frizer", 3)).toEqual(["Velenje", "Žalec", "Šentjur"]);
  });

  it("stops at the daily cap; manual searches are logged too", async () => {
    const r = await runSmartSearch(db, { activity: "frizer", town: "Celje", nearby: false, budget: 20 }, { apiKey: "k", dailyCap: 2, fetchImpl: google([]) });
    expect(r).toMatchObject({ calls: 2, stoppedByQuota: true });
    await admin`truncate api_calls`;
    await runPlacesSearch(db, { query: "frizer Velenje", pages: 1 }, { apiKey: "k", dailyCap: 100, fetchImpl: google([]) });
    expect((await admin`select query, activity, created from places_searches where activity is null`)[0]).toEqual({ query: "frizer Velenje", activity: null, created: 5 });
  });
});
