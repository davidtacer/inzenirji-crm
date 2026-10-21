import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { settings } from "../db/schema";
import { regionOf } from "../places/catalog";
import { extractEmails } from "../research/analyze";
import { addressKey, norm, type DirectoryResult } from "./bizi";

/*
 * Member catalogue of the Chamber of Craft and Small Business (OZS), www1.ozs.si/katalog (owner 2026-10-21: "to je
 * očitno neka dobra stran za email naslove dobit, samo mora dobro delat"). Craftsmen enter their own e-mail there.
 * robots.txt allows all (checked by the owner 2026-10-21). Each regional chamber (OOZ) has its own catalogue id; the
 * ids are read once from the catalogue headings ("Iskalnik po katalogu članov OOZ CELJE") and kept 90 days.
 * Search: GET the catalogue (session cookie + CSRF token), then POST /katalog with ooz, vpis (text), sekcija; the
 * answer is JSON {"#div_katalog-rezultat": html}. Only an entry that matches by phone, street address, or the full
 * distinctive name in the same town is used, and only its own e-mail.
 */

export const OZS = "https://www1.ozs.si";
const UA = "InzenirjiCRM/1.0 (+https://www.inzenirji.si)";
const MAP_KEY = "ozsCatalogues";
const MAP_DAYS = 90;

export type OzsEntry = { name: string; address: string; activity: string | null; phones: string[]; emails: string[] };

type Deps = { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> };

async function get(url: string, deps: Deps, ms = 10_000) {
  return (deps.fetchImpl ?? fetch)(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(ms), redirect: "follow" });
}

const text = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** "Iskalnik po katalogu članov OOZ CELJE" → "OOZ CELJE". */
export function catalogueName(html: string): string | null {
  const m = text(html).match(/katalogu\s+članov\s+(OOZ\s+[A-ZČŠŽĆĐ .-]+?)(?=\s+(?:\.\.\.|izberite|Iskanje|Splošno|«|\d)|$)/i);
  return m ? m[1]!.trim().toUpperCase() : null;
}

/** Entries of a search answer (or a catalogue page). */
export function parseEntries(html: string): OzsEntry[] {
  const out: OzsEntry[] = [];
  for (const block of html.split(/class=["']katalog-clan["']/).slice(1)) {
    const name = text(block.match(/class=["'][^"']*katalog-naziv[^"']*["'][^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "");
    if (!name) continue;
    const after = block.split(/katalog-naziv[^>]*>[\s\S]*?<\/div>/)[1] ?? "";
    const address = text(after.split(/<br/i)[0] ?? "").replace(/\s+,/g, ",");
    const activity = text(block.match(/Dejavnost:\s*<em>([\s\S]*?)<\/em>/i)?.[1] ?? "") || null;
    const phoneText = text(block.match(/Telefon:\s*<strong>([\s\S]*?)<\/strong>/i)?.[1] ?? "");
    const phones = phoneText
      .split(",")
      .map((p) => p.replace(/\D/g, "").replace(/^386/, "0").replace(/^00386/, "0"))
      .map((p) => (p.startsWith("0") ? p : `0${p}`))
      .filter((p) => p.length >= 8);
    out.push({ name, address, activity, phones, emails: extractEmails(block).filter((e) => !/@ozs\.si$/i.test(e)) });
  }
  return out;
}

const digits = (p: string | null) => (p ?? "").replace(/\D/g, "").replace(/^00386|^386/, "0");
const SKIP = new Set(["frizerski", "frizerstvo", "salon", "studio", "center", "trgovina", "storitve", "gostilna", "restavracija", "doo", "sp", "dejavnost"]);
const nameWords = (n: string) => norm(n).split(" ").filter((w) => w.length >= 4 && !SKIP.has(w));

/** How an entry matches the company, or null. */
export function matchEntry(e: OzsEntry, c: { name: string; address: string | null; phone: string | null; city: string | null }): "phone" | "address" | "name" | null {
  const ph = digits(c.phone).replace(/^0/, "");
  if (ph.length >= 7 && e.phones.some((p) => p.replace(/^0/, "").endsWith(ph.slice(-8)))) return "phone";
  const k = addressKey(c.address);
  const a = ` ${norm(e.address)} `;
  if (k && a.includes(` ${k.token} `) && a.includes(` ${norm(k.number)} `) && a.includes(` ${k.post} `)) return "address";
  // A name alone needs at least 2 distinctive words ("Aleksandra" alone matches every Aleksandra in town).
  const words = [...new Set(nameWords(c.name))];
  if (words.length < 2) return null;
  const n = ` ${norm(e.name)} `;
  const sameTown = (k && a.includes(` ${k.post} `)) || (!!c.city && a.includes(` ${norm(c.city)} `));
  if (words.length && words.every((w) => n.includes(` ${w} `)) && sameTown) return "name";
  return null;
}

let lastFailedDiscovery = 0;

/** Catalogue ids by chamber name, read once (about 80 small pages, politely) and kept 90 days. */
export async function catalogueIds(db: Db, deps: Deps = {}, now = new Date()): Promise<Record<string, number>> {
  const [row] = await db.select().from(settings).where(eq(settings.key, MAP_KEY));
  const v = row?.value as { map?: Record<string, number>; at?: string } | undefined;
  if (v?.map && Object.keys(v.map).length && now.getTime() - new Date(v.at ?? 0).getTime() < MAP_DAYS * 86_400_000) return v.map;
  // A failed discovery (site down) is not retried for an hour, so research does not wait on it every time.
  if (lastFailedDiscovery && now.getTime() - lastFailedDiscovery < 3_600_000) return {};
  const map: Record<string, number> = {};
  const sleep = deps.sleep ?? (process.env.VITEST ? async () => {} : (ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let misses = 0;
  for (let id = 1; id <= 120 && misses < 15; id++) {
    try {
      const res = await get(`${OZS}/katalog?ooz=${id}`, deps);
      const name = res.ok ? catalogueName(await res.text()) : null;
      if (name) {
        map[name] = id;
        misses = 0;
      } else misses++;
    } catch {
      misses++;
    }
    await sleep(300);
  }
  if (!Object.keys(map).length) {
    lastFailedDiscovery = now.getTime();
    return map;
  }
  {
    const value = { map, at: now.toISOString() };
    await db.insert(settings).values({ key: MAP_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } });
  }
  return map;
}

/** The chambers to search for a town: its own (by name), else those of towns in the same region (at most 3). */
export function cataloguesFor(map: Record<string, number>, city: string | null): number[] {
  if (!city) return [];
  const entries = Object.entries(map).map(([n, id]) => ({ key: norm(n.replace(/^OOZ\s+/i, "")), id }));
  const c = norm(city);
  const own = entries.filter((e) => e.key === c || e.key.startsWith(`${c} `));
  if (own.length) return own.map((e) => e.id).slice(0, 3);
  const towns = (regionOf(city.replace(/\b\w/g, (x) => x.toUpperCase()))?.towns ?? []).map(norm);
  return entries.filter((e) => towns.some((t) => e.key === t)).map((e) => e.id).slice(0, 3);
}

/** One search in one chamber's catalogue. */
export async function searchCatalogue(ooz: number, term: string, deps: Deps = {}): Promise<OzsEntry[]> {
  const page = await get(`${OZS}/katalog?ooz=${ooz}`, deps);
  const html = await page.text();
  const token = html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']csrf-token["']/i)?.[1] ?? "";
  const cookies = (page.headers.getSetCookie?.() ?? [page.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  const res = await (deps.fetchImpl ?? fetch)(`${OZS}/katalog`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      ...(token ? { "X-CSRF-Token": token } : {}),
      ...(cookies ? { Cookie: cookies } : {}),
      Referer: `${OZS}/katalog?ooz=${ooz}`,
    },
    body: new URLSearchParams({ ooz: String(ooz), vpis: term, sekcija: "", ...(token ? { authenticity_token: token } : {}) }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const body = await res.text();
  let result = body;
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    result = Object.values(j).filter((x): x is string => typeof x === "string").join("\n");
  } catch {
    /* plain HTML answer */
  }
  return parseEntries(result);
}

/** The words to search with: the longest distinctive word of the name (the catalogue lists legal names). */
export function searchTerm(name: string): string | null {
  const w = nameWords(name).sort((a, b) => b.length - a.length)[0];
  return w ?? null;
}

/** Finds the company in the OZS catalogue and returns its own e-mails (may be empty). */
export async function lookupOzs(
  db: Db,
  c: { name: string; address: string | null; phone: string | null; city: string | null; country: string },
  deps: Deps = {},
): Promise<DirectoryResult | null> {
  if (c.country !== "SI") return null;
  const term = searchTerm(c.name);
  if (!term) return null;
  const ids = cataloguesFor(await catalogueIds(db, deps), c.city ?? addressKey(c.address)?.city ?? null);
  let candidates = 0;
  for (const ooz of ids) {
    const entries = await searchCatalogue(ooz, term, deps);
    candidates += entries.length;
    const hits = entries.map((e) => ({ e, by: matchEntry(e, c) })).filter((h) => h.by);
    // Several entries at one address: the phone or the name must agree as well.
    const byAddress = hits.filter((h) => h.by === "address");
    const best =
      hits.find((h) => h.by === "phone") ??
      (byAddress.length === 1 ? byAddress[0] : byAddress.find((h) => matchEntry(h.e, { ...c, address: null, phone: null }) === "name")) ??
      (hits.filter((h) => h.by === "name").length === 1 ? hits.find((h) => h.by === "name") : undefined);
    if (best) {
      return {
        source: "ozs",
        searchUrl: `${OZS}/katalog?ooz=${ooz}`,
        match: { url: `${OZS}/katalog?ooz=${ooz}`, legalName: best.e.name, by: best.by === "address" ? "only" : best.by! },
        emails: best.e.emails,
        candidates: entries.length,
      };
    }
  }
  return ids.length ? { source: "ozs", searchUrl: `${OZS}/katalog?ooz=${ids[0]}`, match: null, emails: [], candidates } : null;
}
