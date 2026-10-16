import { domainOf, normalizeEmail } from "../contact/normalize";
import { websiteKind } from "../contact/website";
import { AiError, callClaudeWithSearch } from "../ai/anthropic";
import type { AiConfig } from "../ai/remark";
import { addressKey, norm } from "../directories/bizi";
import { extractEmails } from "./analyze";
import { safeFetch, type Resolver } from "./safe-fetch";

/*
 * Web search during research (TASK-031, ADR-030). Claude searches the web like the owner would (site, social profiles,
 * directories such as najdi.si, published e-mails). We never trust it blindly: a website or directory page is accepted
 * only when the page itself shows the company's phone, address or name + city; an e-mail only when it is on a page we
 * opened (that page becomes its source, ADR-007). The rest is kept as unverified links / e-mail candidates.
 */

export type FoundLink = { url: string; kind: string; source: "web_search"; verified: boolean; note: string | null };
export type FoundEmail = { email: string; source: string };
export type WebFindings = {
  website: string | null;
  links: FoundLink[];
  emails: FoundEmail[];
  candidates: FoundEmail[];
  legalName: string | null;
  summary: string | null;
  searches: number;
  costMicroUsd: number;
  inputTokens: number;
  outputTokens: number;
  ok: boolean;
};

const SYSTEM = `Si raziskovalec za prodajo spletnih strani. Za eno lokalno podjetje v Sloveniji poišči na spletu:
- uradno spletno stran (tudi na Wix, Google Sites, WordPress.com, ipd.),
- profile na Facebooku, Instagramu, TikToku, LinkedInu, YouTubu,
- vnose v imenikih (najdi.si, zemljevid.najdi.si, bizi.si, itis.siol.net, ipd.) in spletne rezervacije,
- javno objavljene e-naslove podjetja.
Z imenom, naslovom in telefonom preveri, da gre za ISTO podjetje; drugih podjetij z istim imenom ne vključi. E-naslovov ne ugibaj.
Odgovori SAMO z JSON:
{"website": "url ali null", "links": [{"url": "...", "kind": "website|facebook|instagram|tiktok|linkedin|youtube|directory|booking|other", "note": "kratko"}],
 "emails": [{"email": "...", "source_url": "stran, kjer je objavljen"}], "legal_name": "uradno ime (d.o.o./s.p.) ali null", "summary": "1-2 stavka, kaj si izvedel o podjetju"}`;

export type CompanyForSearch = { name: string; category: string | null; address: string | null; city: string | null; phone: string | null; website: string | null; country: string };

const KINDS = new Set(["website", "facebook", "instagram", "tiktok", "linkedin", "youtube", "directory", "booking", "other"]);
const GENERIC = new Set(["salon", "frizerski", "frizerstvo", "studio", "gostilna", "restavracija", "center", "trgovina", "storitve", "doo", "d", "o", "s", "p", "sp"]);

function parse(text: string) {
  try {
    const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "null") as Record<string, unknown> | null;
    if (!j) return null;
    const links = Array.isArray(j.links) ? (j.links as Record<string, unknown>[]) : [];
    const emails = Array.isArray(j.emails) ? (j.emails as Record<string, unknown>[]) : [];
    return {
      website: typeof j.website === "string" && /^https?:\/\//i.test(j.website) ? j.website : null,
      links: links
        .filter((l) => typeof l.url === "string" && /^https?:\/\//i.test(l.url as string))
        .slice(0, 15)
        .map((l) => ({ url: String(l.url), kind: KINDS.has(String(l.kind)) ? String(l.kind) : "other", note: typeof l.note === "string" ? l.note.slice(0, 200) : null })),
      emails: emails.filter((e) => typeof e.email === "string").slice(0, 10).map((e) => ({ email: String(e.email), source: typeof e.source_url === "string" ? e.source_url : "" })),
      legalName: typeof j.legal_name === "string" ? j.legal_name.slice(0, 200) : null,
      summary: typeof j.summary === "string" ? j.summary.slice(0, 600) : null,
    };
  } catch {
    return null;
  }
}

/** Does this page belong to the company? Phone, street + number + post code, or a distinctive name word + city. */
export function pageMatches(html: string, c: CompanyForSearch): boolean {
  const text = norm(html.replace(/<[^>]+>/g, " "));
  const digits = html.replace(/\D/g, "");
  const phone = (c.phone ?? "").replace(/\D/g, "").replace(/^386/, "0").replace(/^0/, "");
  if (phone.length >= 7 && digits.includes(phone)) return true;
  const k = addressKey(c.address);
  const words = ` ${text} `;
  if (k && words.includes(` ${k.token} `) && words.includes(` ${norm(k.number)} `) && words.includes(` ${k.post} `)) return true;
  const nameWords = norm(c.name).split(" ").filter((w) => w.length >= 4 && !GENERIC.has(w));
  return !!c.city && nameWords.some((w) => words.includes(` ${w} `)) && words.includes(` ${norm(c.city)} `);
}

const IGNORE_EMAIL = /@(najdi\.si|bizi\.si|tsmedia\.si|telekom\.si|wix\.com|wixpress\.com|example\.com|sentry\.io|google\.com)$/i;
const FETCHABLE = (u: string) => !/(^|\.)(facebook|instagram|tiktok|linkedin|youtube|x|twitter)\.com$/i.test(new URL(u).hostname);

export async function findOnWeb(
  c: CompanyForSearch,
  ai: AiConfig,
  deps: { fetchImpl?: typeof fetch; resolve?: Resolver; maxSearches?: number },
): Promise<WebFindings> {
  const empty: WebFindings = { website: null, links: [], emails: [], candidates: [], legalName: null, summary: null, searches: 0, costMicroUsd: 0, inputTokens: 0, outputTokens: 0, ok: false };
  let r;
  try {
    r = await callClaudeWithSearch(
      {
        model: ai.model,
        system: SYSTEM,
        user: [`Podjetje: ${c.name}`, c.category ? `Dejavnost: ${c.category}` : "", c.address ? `Naslov: ${c.address}` : "", c.phone ? `Telefon: ${c.phone}` : "", c.website ? `Znana povezava: ${c.website}` : ""].filter(Boolean).join("\n"),
        maxTokens: 1500,
        maxSearches: deps.maxSearches ?? 4,
        country: c.country,
        city: c.city ?? undefined,
      },
      { apiKey: ai.apiKey, fetchImpl: ai.fetchImpl },
    );
  } catch (e) {
    if (e instanceof AiError || (e instanceof Error && e.name === "AbortError")) return empty;
    throw e;
  }
  const out: WebFindings = { ...empty, searches: r.searches, costMicroUsd: r.costMicroUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens };
  const p = parse(r.text);
  if (!p) return out;
  out.ok = true;
  out.legalName = p.legalName;
  out.summary = p.summary;

  // Open candidate pages ourselves (site + directories), at most 5.
  const pages = new Map<string, string>();
  const toOpen = [p.website, ...p.links.filter((l) => l.kind === "website" || l.kind === "directory").map((l) => l.url), ...p.emails.map((e) => e.source)]
    .filter((u): u is string => !!u && /^https?:\/\//i.test(u))
    .filter((u, i, a) => a.indexOf(u) === i && FETCHABLE(u))
    .slice(0, 5);
  for (const u of toOpen) {
    try {
      const page = await safeFetch(u, { fetchImpl: deps.fetchImpl, resolve: deps.resolve, timeoutMs: 8_000 });
      if (page.status < 400) pages.set(u, page.html);
    } catch {
      /* unreachable pages stay unverified */
    }
  }
  const verified = (u: string) => {
    const html = pages.get(u);
    return !!html && pageMatches(html, c);
  };

  const site = [p.website, ...p.links.filter((l) => l.kind === "website").map((l) => l.url)].find((u) => !!u && websiteKind(domainOf(u)) === "own" && verified(u)) ?? null;
  out.website = site;
  const seen = new Set<string>();
  for (const l of [...(p.website ? [{ url: p.website, kind: "website", note: null }] : []), ...p.links]) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    const fetchable = FETCHABLE(l.url);
    out.links.push({ url: l.url, kind: l.kind, source: "web_search", verified: fetchable ? verified(l.url) : false, note: l.note });
  }

  // E-mails: verified only when we saw them on a page that belongs to the company.
  const onPages = new Map<string, string>();
  for (const [u, html] of pages) if (pageMatches(html, c)) for (const e of extractEmails(html)) if (!IGNORE_EMAIL.test(e) && !onPages.has(e)) onPages.set(e, u);
  for (const [e, u] of onPages) out.emails.push({ email: e, source: u });
  for (const e of p.emails) {
    const em = normalizeEmail(e.email);
    if (!em || IGNORE_EMAIL.test(em) || onPages.has(em)) continue;
    out.candidates.push({ email: em, source: e.source });
  }
  return out;
}
