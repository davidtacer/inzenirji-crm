import { extractEmails } from "../research/analyze";
import { safeFetch, type Resolver } from "../research/safe-fetch";

/*
 * Public business directory bizi.si (TASK-025, ADR-022). Google shows the shop name ("Frizerski salon X"),
 * the directory shows the legal name ("ANA NOVAK s.p."), so we match by ADDRESS: same post code, street and
 * house number. Several companies at one address → we also need the name or the phone to agree.
 * robots.txt of bizi.si allows all crawlers (checked 2026-10-15). One search + at most 3 company pages.
 */

export const BIZI = "https://www.bizi.si";

const GENERIC = new Set(["ulica", "ul", "cesta", "c", "trg", "pot", "ob", "na", "v", "pri", "in", "nabrezje", "nabr", "sv", "dr"]);

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type AddressKey = { street: string; token: string; number: string; post: string; city: string };

/** "Gosposka ulica 2, 3000 Celje, Slovenija" → street words, house number, post code. */
export function addressKey(address: string | null): AddressKey | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim());
  const post = address.match(/\b(\d{4})\s+([^,\d]+)/);
  const street = parts[0];
  const num = street.match(/\b(\d+[a-zA-Z]?)\s*$/)?.[1];
  if (!post || !num) return null;
  const words = norm(street.replace(num, "")).split(" ").filter((w) => w && !GENERIC.has(w));
  const token = words.sort((a, b) => b.length - a.length)[0];
  if (!token) return null;
  return { street, token, number: num.toLowerCase(), post: post[1], city: post[2].trim() };
}

export function searchUrl(k: AddressKey): string {
  return `${BIZI}/iskanje?q=${encodeURIComponent(`${k.street} ${k.city}`)}`;
}

export type BiziHit = { url: string; name: string };

/** Results of a bizi.si search whose address block has our post code, street word and house number. */
export function parseResults(html: string, k: AddressKey): BiziHit[] {
  const re = /<a\b[^>]*href=["'](?:https?:\/\/www\.bizi\.si)?\/([A-Z0-9][A-Z0-9_-]*)\/["'][^>]*>([\s\S]*?)<\/a>/g;
  const anchors = [...html.matchAll(re)].map((m) => ({ slug: m[1], name: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), at: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
  const hits: BiziHit[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (!a.name || a.slug === "TSMEDIA") continue;
    const block = norm(html.slice(a.end, anchors[i + 1]?.at ?? a.end + 600).replace(/<[^>]+>/g, " ")).slice(0, 300);
    const words = ` ${block} `;
    if (words.includes(` ${k.post} `) && words.includes(` ${k.token} `) && words.includes(` ${norm(k.number)} `)) {
      const url = `${BIZI}/${a.slug}/`;
      if (!hits.some((h) => h.url === url)) hits.push({ url, name: a.name });
    }
  }
  return hits;
}

const IGNORE = /@(bizi\.si|tsmedia\.si|telekom\.si)$/i;

export function companyPageEmails(html: string): string[] {
  return extractEmails(html).filter((e) => !IGNORE.test(e));
}

function nameOverlap(googleName: string, legalName: string): boolean {
  const skip = new Set(["d", "o", "s", "p", "doo", "sp", "salon", "frizerski", "frizerstvo", "gostilna", "restavracija", "studio", "center", "trgovina", "storitve"]);
  const g = new Set(norm(googleName).split(" ").filter((w) => w.length > 2 && !skip.has(w)));
  return norm(legalName)
    .split(" ")
    .some((w) => w.length > 2 && !skip.has(w) && g.has(w));
}

export type DirectoryResult = {
  source: "bizi";
  searchUrl: string;
  match: { url: string; legalName: string; by: "only" | "name" | "phone" } | null;
  emails: string[];
  candidates: number;
};

/** Finds the company in bizi.si by address and returns its published e-mails (may be empty). */
export async function lookupBizi(
  c: { name: string; address: string | null; phone: string | null; country: string },
  deps: { fetchImpl?: typeof fetch; resolve?: Resolver },
): Promise<DirectoryResult | null> {
  if (c.country !== "SI") return null;
  const k = addressKey(c.address);
  if (!k) return null;
  const url = searchUrl(k);
  const page = await safeFetch(url, { ...deps, timeoutMs: 10_000 });
  if (page.status >= 400) return { source: "bizi", searchUrl: url, match: null, emails: [], candidates: 0 };
  const hits = parseResults(page.html, k);
  const phone = c.phone?.replace(/\D/g, "").replace(/^386/, "0") ?? "";
  for (const h of hits.slice(0, 3)) {
    const byName = nameOverlap(c.name, h.name);
    if (hits.length > 1 && !byName && !phone) continue;
    const sub = await safeFetch(h.url, { ...deps, timeoutMs: 10_000 });
    if (sub.status >= 400) continue;
    const digits = sub.html.replace(/\D/g, "");
    const byPhone = phone.length >= 8 && digits.includes(phone.replace(/^0/, ""));
    const by = hits.length === 1 ? "only" : byName ? "name" : byPhone ? "phone" : null;
    if (!by) continue;
    return { source: "bizi", searchUrl: url, match: { url: h.url, legalName: h.name, by }, emails: companyPageEmails(sub.html), candidates: hits.length };
  }
  return { source: "bizi", searchUrl: url, match: null, emails: [], candidates: hits.length };
}
