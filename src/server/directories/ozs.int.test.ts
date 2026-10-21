import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { catalogueIds, lookupOzs } from "./ozs";
import { ANSWER } from "./ozs.test";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE settings");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

/** A fake www1.ozs.si: catalogues 13 (Celje) and 14 (Velenje); POST /katalog answers like the real site. */
function site() {
  const posts: { headers: Record<string, string>; body: string }[] = [];
  let gets = 0;
  const fetchImpl = (async (u: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts.push({ headers: init.headers as Record<string, string>, body: String(init.body) });
      return new Response(ANSWER, { headers: { "content-type": "application/json" } });
    }
    gets++;
    const id = Number(new URL(u).searchParams.get("ooz"));
    const name = { 13: "CELJE", 14: "VELENJE" }[id];
    if (!name) return new Response("<h1>Napaka</h1>", { status: 404 });
    return new Response(`<meta name="csrf-token" content="tok123"><h1>Iskalnik po katalogu članov OOZ ${name}</h1>`, { headers: { "set-cookie": "_ozs_session=abc; path=/; HttpOnly" } });
  }) as unknown as typeof fetch;
  return { fetchImpl, posts, gets: () => gets };
}

describe("OZS catalogue lookup (owner 2026-10-21)", () => {
  it("learns the catalogue ids once, searches with session and token, takes only the matching entry's e-mail", async () => {
    const s = site();
    expect(await catalogueIds(db, { fetchImpl: s.fetchImpl })).toEqual({ "OOZ CELJE": 13, "OOZ VELENJE": 14 });
    const discovery = s.gets();
    expect(await catalogueIds(db, { fetchImpl: s.fetchImpl })).toEqual({ "OOZ CELJE": 13, "OOZ VELENJE": 14 });
    expect(s.gets()).toBe(discovery); // kept, not read again

    const r = await lookupOzs(db, { name: "Frizerski salon Aleksandra", address: "Gosposka ulica 2, 3000 Celje, Slovenija", phone: null, city: "Celje", country: "SI" }, { fetchImpl: s.fetchImpl });
    expect(r).toMatchObject({ source: "ozs", match: { legalName: "FRIZERSKI SALON ALEKSANDRA, ALEKSANDRA STEGU s.p.", by: "only" }, emails: ["goran.stegu@siol.net"] });
    expect(s.posts[0]!.body).toBe("ooz=13&vpis=aleksandra&sekcija=&authenticity_token=tok123");
    expect(s.posts[0]!.headers).toMatchObject({ "X-CSRF-Token": "tok123", Cookie: "_ozs_session=abc", "X-Requested-With": "XMLHttpRequest" });

    // Aleksandra Lever is not in the catalogue: nothing is taken from the other Aleksandras.
    const lever = await lookupOzs(db, { name: "Frizerski Salon Aleksandra, Aleksandra Lever S.P.", address: "Mariborska cesta 10, 3000 Celje", phone: "041 999 888", city: "Celje", country: "SI" }, { fetchImpl: s.fetchImpl });
    expect(lever).toMatchObject({ match: null, emails: [] });
  });
});
