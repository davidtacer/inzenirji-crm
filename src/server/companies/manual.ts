import { and, eq, or, sql } from "drizzle-orm";
import { domainOf, normalizeEmail } from "../contact/normalize";
import { websiteKind } from "../contact/website";
import type { Db } from "../db/client";
import { companies, contacts, deals } from "../db/schema";
import { extractEmails, pageText, rankEmails } from "../research/analyze";
import { safeFetch, type Resolver } from "../research/safe-fetch";

/*
 * Manual company entry (TASK-026, ADR-024). The owner pastes a bizi.si company page or the company's own site;
 * we read what we can into a form he checks and corrects, then save. Also works with no URL at all.
 */

export { EMPTY_PREFILL, type Prefill } from "@/lib/prefill";
import type { Prefill } from "@/lib/prefill";

const NOT_A_WEBSITE = /(^|\.)(bizi\.si|tsmedia\.si|siol\.net|telekom\.si|google\.[a-z.]+|gstatic\.com|googleapis\.com|w3\.org|schema\.org|facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com|ajpes\.si|gov\.si|moje-delo\.com|mojedelo\.com|bonitete\.si|apple\.com|microsoft\.com|cloudflare\.com|jquery\.com|stripe\.com|paypal\.com)$/i;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const title = (s: string) => (s === s.toUpperCase() ? s : s);

/** Slovenian address in text: "Gosposka ulica 2, Celje, 3000 Celje" → address + city. */
export function findAddress(text: string): { address: string; city: string } | null {
  const re = /([A-ZČŠŽ][A-Za-zČŠŽčšžćđĆĐ. -]{2,60}?\s\d{1,4}[a-zA-Z]?)\s*,\s*(?:[A-ZČŠŽ][^,\n\d]{1,40},\s*)?(\d{4})\s+([A-ZČŠŽ][A-Za-zČŠŽčšž .-]{1,40})/;
  const m = text.match(re);
  if (!m) return null;
  const city = clean(m[3]).replace(/\s*(Slovenija|Slovenia)$/i, "");
  return { address: `${clean(m[1])}, ${m[2]} ${city}`, city };
}

export function findPhone(html: string, text: string): string {
  const tel = html.match(/tel:([+\d\s()/.-]{6,})/i)?.[1];
  if (tel) return clean(tel);
  return clean(text.match(/(?:\+386\s?|\b0)\d{1,2}[\s/.-]?\d{3}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,3})?\b/)?.[0] ?? "");
}

export function findWebsite(html: string, pageHost: string): string {
  for (const m of html.matchAll(/href=["'](https?:\/\/[^"'#\s]+)["']/gi)) {
    let u: URL;
    try {
      u = new URL(m[1]);
    } catch {
      continue;
    }
    const host = u.hostname.replace(/^www\./, "");
    if (host === pageHost || NOT_A_WEBSITE.test(host)) continue;
    return `${u.protocol}//${u.hostname}`;
  }
  return "";
}

/** Reads a bizi.si company page or any company site into a prefill. */
export function prefillFromHtml(html: string, url: string): Prefill {
  const host = new URL(url).hostname.replace(/^www\./, "");
  // Body text only: the <title> would run into the first address line.
  const text = pageText(html.replace(/<head[\s\S]*?<\/head>|<title[\s\S]*?<\/title>/gi, " "));
  const isBizi = host === "bizi.si";
  const h1 = clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "").replace(/<[^>]+>/g, " "));
  const pageTitle = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/<[^>]+>/g, " ")).split(/\s[|–-]\s/)[0];
  const addr = findAddress(text);
  const emails = extractEmails(html).filter((e) => !/@(bizi\.si|tsmedia\.si|telekom\.si)$/i.test(e));
  const website = isBizi ? findWebsite(html, host) : `https://${new URL(url).hostname}`;
  const best = rankEmails(emails, domainOf(website))[0] ?? "";
  const category = isBizi ? clean(text.match(/(?:Dejavnost|Glavna dejavnost)[:\s]*\n?\s*(?:\d{2}\.\d{3}\s*)?([^\n]{3,80})/i)?.[1] ?? "") : "";
  return {
    name: title(h1 || pageTitle),
    address: addr?.address ?? "",
    city: addr?.city ?? "",
    phone: findPhone(html, text),
    email: best,
    emailSource: best ? url : "",
    website,
    category,
  };
}

export async function prefillFromUrl(raw: string, deps: { fetchImpl?: typeof fetch; resolve?: Resolver } = {}): Promise<Prefill> {
  const url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
  const page = await safeFetch(url, { ...deps, timeoutMs: 10_000 });
  if (page.status >= 400) throw new Error(`HTTP_${page.status}`);
  return prefillFromHtml(page.html, page.finalUrl);
}

export type ManualResult = { ok: true; id: string; existed: boolean } | { ok: false; message: string };

/** Saves the checked form. Returns an existing company (same domain, phone or name + city) instead of a duplicate. */
export async function createManualCompany(db: Db, input: Prefill): Promise<ManualResult> {
  const name = clean(input.name);
  if (name.length < 2) return { ok: false, message: "Vpiši ime podjetja." };
  const email = input.email.trim() ? normalizeEmail(input.email) : null;
  if (input.email.trim() && !email) return { ok: false, message: "E-naslov ni veljaven." };
  const emailSource = clean(input.emailSource) || (email ? "vnesel lastnik" : "");
  const website = input.website.trim() ? (/^https?:\/\//i.test(input.website.trim()) ? input.website.trim() : `https://${input.website.trim()}`) : null;
  const websiteDomain = domainOf(website);
  const phone = clean(input.phone) || null;
  const phoneDigits = (phone ?? "").replace(/\D/g, "").replace(/^386/, "0");
  const city = clean(input.city) || null;

  const conds = [and(eq(companies.name, name), city ? eq(companies.city, city) : sql`${companies.city} is null`)];
  if (websiteDomain && websiteKind(websiteDomain) === "own") conds.push(eq(companies.websiteDomain, websiteDomain));
  if (phoneDigits.length >= 8) conds.push(sql`regexp_replace(regexp_replace(${companies.phone}, '\\D', '', 'g'), '^386', '0') = ${phoneDigits}`);
  const [found] = await db.select({ id: companies.id }).from(companies).where(or(...conds)).limit(1);

  const id = await db.transaction(async (tx) => {
    let cid = found?.id;
    if (!cid) {
      const [c] = await tx
        .insert(companies)
        .values({ name, address: clean(input.address) || null, city, phone, website, websiteDomain, category: clean(input.category) || null })
        .returning({ id: companies.id });
      cid = c.id;
      await tx.insert(deals).values({ companyId: cid, source: "manual" });
    }
    if (email) await tx.insert(contacts).values({ companyId: cid, email, emailSource }).onConflictDoNothing();
    return cid;
  });
  return { ok: true, id, existed: !!found };
}
