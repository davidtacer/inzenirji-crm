import { domainOf, normalizeEmail } from "../contact/normalize";
import { websiteKind } from "../contact/website";
import { AiError, callClaudeWithSearch } from "../ai/anthropic";
import type { AiConfig } from "../ai/remark";
import { addressKey, norm } from "../directories/bizi";
import { extractEmails, siteState, type SiteState } from "./analyze";
import { safeFetch, type Resolver } from "./safe-fetch";

/*
 * AI web research (TASK-031, rebuilt in TASK-034 / ADR-036). Claude searches the web the way the owner does on Google:
 * the company's own domain (also one named only in an Instagram/Facebook bio), social profiles with what their bio
 * says, old sites on Wix & co., directory entries (najdi.si, bizi.si), the legal entity, published e-mails, people
 * and facts for a personal e-mail. We never trust it blindly: we open the pages ourselves; a website is accepted when
 * its page shows the company's phone/address/name+city, or when the domain carries the company's name (e.g. a
 * "v izdelavi" page); an e-mail only when it is on a page we opened (ADR-007). The rest stays visible as unverified.
 */

export type FoundLink = { url: string; kind: string; source: "web_search"; verified: boolean; note: string | null };
export type FoundEmail = { email: string; source: string };
export type Profile = { kind: string; url: string; handle: string | null; followers: number | null; bio: string | null; website: string | null };
export type OtherSite = { url: string; note: string | null; state: SiteState | "unreachable" | null };
export type Entity = { name: string; address: string | null; taxId: string | null; source: string | null };
export type Person = { name: string; role: string | null };

export type WebFindings = {
  website: string | null;
  /** What the accepted website shows (a "v izdelavi" page is a strong lead). */
  websiteState: SiteState | null;
  /** Where the website came from, e.g. "Instagram bio", "Google", "najdi.si". */
  websiteFrom: string | null;
  links: FoundLink[];
  emails: FoundEmail[];
  candidates: FoundEmail[];
  legalName: string | null;
  summary: string | null;
  profiles: Profile[];
  otherSites: OtherSite[];
  entities: Entity[];
  people: Person[];
  services: string[];
  facts: string[];
  phones: string[];
  searches: number;
  costMicroUsd: number;
  inputTokens: number;
  outputTokens: number;
  ok: boolean;
  /** Why the search failed, in words the owner can act on. */
  error: string | null;
  /** Who researched: the CRM's own Claude API call, or the nightly Claude researcher over MCP (TASK-036). */
  by?: "api" | "agent";
};

const SYSTEM = `Si raziskovalec za prodajo spletnih strani. Za eno lokalno podjetje v Sloveniji na spletu zberi VSE, kar bi o njem v 5 minutah našel izkušen prodajalec z Googlom. Naredi več iskanj, na primer:
1) ime + kraj, 2) ime + "instagram" in ime + "facebook", 3) telefonska številka, 4) naslov, 5) ime v imenikih (najdi.si, zemljevid.najdi.si, bizi.si, itis), 6) domena, ki jo podjetje navaja.
Iščemo:
- uradno domeno podjetja, TUDI če je navedena samo v opisu (bio) na Instagramu ali Facebooku ali v imeniku, in tudi če na njej piše "v izdelavi";
- stare ali dodatne strani na graditeljih (Wix, wixsite.com, Webnode, Weebly, Jimdo, Google Sites, WordPress.com, Blogspot …);
- profile na Instagramu, Facebooku, TikToku, LinkedInu, YouTubu: povezava, uporabniško ime, število sledilcev, kaj piše v opisu, katero spletno stran navajajo;
- pravno osebo (d.o.o., s.p.) iz imenikov: uradno ime, naslov, davčna številka, če je vidna; podjetij z istim imenom drugje NE vključi;
- javno objavljene e-naslove in telefone, vsakega z URL-jem strani, kjer je objavljen;
- osebe (lastnik, frizerka, kuhar …) z vlogo, storitve, posebnosti in zanimiva dejstva za osebni e-mail (npr. "osmo leto", "solna soba", "nagrada");
- vse druge koristne povezave (rezervacije, imeniki, članki).
Z imenom, naslovom in telefonom preveri, da gre za ISTO podjetje. Ničesar ne ugibaj; če nečesa ne najdeš, pusti prazno.
Na koncu odgovori SAMO z enim JSON objektom (brez drugega besedila):
{"website": "https://… ali null", "website_from": "npr. Instagram bio | Google | najdi.si | null",
 "other_sites": [{"url": "…", "note": "npr. stara stran na Wixu"}],
 "profiles": [{"kind": "instagram|facebook|tiktok|linkedin|youtube", "url": "…", "handle": "…", "followers": 2888, "bio": "kratko, kar piše v opisu", "website": "domena iz opisa ali null"}],
 "links": [{"url": "…", "kind": "directory|booking|article|other", "note": "kratko"}],
 "entities": [{"name": "uradno ime", "address": "…", "tax_id": "… ali null", "source": "URL"}],
 "emails": [{"email": "…", "source_url": "…"}], "phones": ["…"],
 "people": [{"name": "…", "role": "…"}], "services": ["…"], "facts": ["…"],
 "summary": "2-3 stavki: kdo so, kaj ponujajo, kakšno je stanje njihove spletne prisotnosti"}`;

export type CompanyForSearch = { name: string; category: string | null; address: string | null; city: string | null; phone: string | null; website: string | null; country: string };

const PROFILE_KINDS = new Set(["instagram", "facebook", "tiktok", "linkedin", "youtube"]);
const LINK_KINDS = new Set(["website", "facebook", "instagram", "tiktok", "linkedin", "youtube", "directory", "booking", "article", "other"]);
const GENERIC = new Set(["salon", "frizerski", "frizerstvo", "studio", "gostilna", "restavracija", "center", "trgovina", "storitve", "doo", "d", "o", "s", "p", "sp", "lepotni", "kozmeticni", "avto", "servis", "pizzeria", "bar", "kavarna", "hotel", "apartmaji", "zobna", "ordinacija"]);
/** Hosts of site builders: a site there is an old/free site, not the company's own domain. */
const BUILDER = /(^|\.)(wixsite\.com|wix\.com|webnode\.(com|si|page)|weebly\.com|jimdosite\.com|jimdofree\.com|site123\.me|sites\.google\.com|wordpress\.com|blogspot\.com|godaddysites\.com|squarespace\.com|mystrikingly\.com|business\.site|ueniweb\.com)$/i;

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const url = (v: unknown) => {
  const s = str(v, 1000);
  if (!s) return null;
  const u = /^https?:\/\//i.test(s) ? s : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(s) ? `https://${s}` : null;
  try {
    return u && new URL(u) ? u : null;
  } catch {
    return null;
  }
};
const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : []);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** The last JSON object in Claude's answer (it may write a sentence or a code fence around it). */
export function parseResearch(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const followers = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  return {
    website: url(j.website),
    websiteFrom: str(j.website_from, 80),
    otherSites: arr(j.other_sites).map(obj).map((o) => ({ url: url(o.url), note: str(o.note, 200) })).filter((o): o is { url: string; note: string | null } => !!o.url).slice(0, 5),
    profiles: arr(j.profiles)
      .map(obj)
      .map((o) => ({ kind: String(o.kind ?? "").toLowerCase(), url: url(o.url), handle: str(o.handle, 80), followers: followers(o.followers), bio: str(o.bio, 400), website: url(o.website) }))
      .filter((p): p is Profile => !!p.url && PROFILE_KINDS.has(p.kind))
      .slice(0, 8),
    links: arr(j.links)
      .map(obj)
      .map((o) => ({ url: url(o.url), kind: LINK_KINDS.has(String(o.kind)) ? String(o.kind) : "other", note: str(o.note, 200) }))
      .filter((l): l is { url: string; kind: string; note: string | null } => !!l.url)
      .slice(0, 15),
    entities: arr(j.entities).map(obj).map((o) => ({ name: str(o.name, 200), address: str(o.address, 200), taxId: str(o.tax_id, 20), source: url(o.source) })).filter((e): e is Entity => !!e.name).slice(0, 3),
    emails: arr(j.emails).map(obj).map((o) => ({ email: str(o.email, 200), source: url(o.source_url) ?? "" })).filter((e): e is FoundEmail => !!e.email).slice(0, 10),
    phones: arr(j.phones).map((p) => str(p, 40)).filter((p): p is string => !!p).slice(0, 5),
    people: arr(j.people).map(obj).map((o) => ({ name: str(o.name, 80), role: str(o.role, 80) })).filter((p): p is Person => !!p.name).slice(0, 6),
    services: arr(j.services).map((s) => str(s, 80)).filter((s): s is string => !!s).slice(0, 12),
    facts: arr(j.facts).map((s) => str(s, 200)).filter((s): s is string => !!s).slice(0, 8),
    legalName: str(j.legal_name, 200),
    summary: str(j.summary, 800),
  };
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
  const nameWords = distinctiveWords(c.name);
  return !!c.city && nameWords.some((w) => words.includes(` ${w} `)) && words.includes(` ${norm(c.city)} `);
}

const distinctiveWords = (name: string) => norm(name).split(" ").filter((w) => w.length >= 4 && !GENERIC.has(w));

/** "salonfantazija.si" carries "Frizerski salon FANTAZIJA" (a distinctive name word in the domain label). */
export function domainCarriesName(domain: string | null, name: string): boolean {
  if (!domain) return false;
  const label = norm(domain.split(".").slice(0, -1).join(" ")).replace(/\s+/g, "");
  return distinctiveWords(name).some((w) => label.includes(w));
}

export const isBuilderSite = (u: string) => {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return BUILDER.test(h);
  } catch {
    return false;
  }
};

const IGNORE_EMAIL = /@(najdi\.si|bizi\.si|tsmedia\.si|telekom\.si|wix\.com|wixpress\.com|example\.com|sentry\.io|google\.com|itis\.si)$/i;
const FETCHABLE = (u: string) => !/(^|\.)(facebook|instagram|tiktok|linkedin|youtube|x|twitter)\.com$/i.test(new URL(u).hostname);

/** Human message for a failed search (shown on the company page). */
export function searchError(e: unknown): string {
  if (e instanceof AiError) {
    const d = e.detail ?? "";
    if (/web.?search/i.test(d) && /(enable|disabled|not (allowed|available)|permission)/i.test(d))
      return "Spletno iskanje ni vklopljeno v Anthropic Console (Settings → Privacy / Organization → Web search).";
    if (e.status === 401) return "Ključ ANTHROPIC_API_KEY ni veljaven.";
    if (e.status === 429) return "Preveč zahtev na Claude API, poskusi čez minuto.";
    if (e.status === 529 || e.status >= 500) return `Claude API trenutno ne dela (${e.status}).`;
    return `Claude API je zavrnil iskanje (${e.status}${d ? `: ${d}` : ""}).`;
  }
  if (e instanceof Error && e.name === "AbortError") return "Iskanje je trajalo predolgo (časovna omejitev).";
  return "Iskanje ni uspelo.";
}

export function emptyFindings(): WebFindings {
  return {
    website: null, websiteState: null, websiteFrom: null, links: [], emails: [], candidates: [], legalName: null, summary: null,
    profiles: [], otherSites: [], entities: [], people: [], services: [], facts: [], phones: [],
    searches: 0, costMicroUsd: 0, inputTokens: 0, outputTokens: 0, ok: false, error: null,
  };
}

export async function findOnWeb(
  c: CompanyForSearch,
  ai: AiConfig,
  deps: { fetchImpl?: typeof fetch; resolve?: Resolver; maxSearches?: number },
): Promise<WebFindings> {
  const empty = emptyFindings();
  let r;
  try {
    r = await callClaudeWithSearch(
      {
        model: ai.model,
        system: SYSTEM,
        user: [
          `Podjetje: ${c.name}`,
          c.category ? `Dejavnost: ${c.category}` : "",
          c.address ? `Naslov: ${c.address}` : "",
          c.city ? `Kraj: ${c.city}` : "",
          c.phone ? `Telefon: ${c.phone}` : "",
          c.website ? `Znana povezava: ${c.website}` : "",
        ].filter(Boolean).join("\n"),
        maxTokens: 4000,
        maxSearches: deps.maxSearches ?? 10,
        country: c.country,
        city: c.city ?? undefined,
      },
      { apiKey: ai.apiKey, fetchImpl: ai.fetchImpl },
    );
  } catch (e) {
    if (e instanceof AiError || (e instanceof Error && e.name === "AbortError")) {
      console.error("[research] web search failed:", e instanceof AiError ? `${e.status} ${e.detail ?? ""}` : "timeout");
      return { ...empty, error: searchError(e) };
    }
    throw e;
  }
  const out: WebFindings = { ...empty, searches: r.searches, costMicroUsd: r.costMicroUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens };
  const p = parseResearch(r.text);
  if (!p) {
    console.error("[research] web search: no JSON", r.stopReason, r.text.slice(0, 200));
    return { ...out, error: r.stopReason === "max_tokens" ? "Odgovor AI je bil predolg; poskusi znova." : "AI ni vrnil podatkov v pričakovani obliki; poskusi znova." };
  }
  return verifyFindings(c, p, out, deps);
}

export type ParsedResearch = NonNullable<ReturnType<typeof parseResearch>>;

/**
 * Checks parsed findings against the web (TASK-034) and fills WebFindings: opens the candidate pages, accepts the
 * website and e-mails only with evidence. Used for the CRM's own search and for findings sent by the nightly Claude
 * researcher over MCP (TASK-036).
 */
export async function verifyFindings(
  c: CompanyForSearch,
  p: ParsedResearch,
  base: WebFindings,
  deps: { fetchImpl?: typeof fetch; resolve?: Resolver },
): Promise<WebFindings> {
  const out: WebFindings = { ...base };
  out.ok = true;
  out.summary = p.summary;
  out.legalName = p.entities[0]?.name ?? p.legalName;
  out.entities = p.entities;
  out.people = p.people;
  out.services = p.services;
  out.facts = p.facts;
  out.phones = p.phones;
  out.profiles = p.profiles;

  // Open candidate pages ourselves: websites (incl. domains from profile bios), old sites, directories, e-mail sources.
  const siteCandidates = [p.website, ...p.profiles.map((x) => x.website), ...p.links.filter((l) => l.kind === "website").map((l) => l.url), ...p.otherSites.map((o) => o.url)].filter(
    (u, i, a): u is string => !!u && a.indexOf(u) === i,
  );
  const toOpen = [...siteCandidates, ...p.links.filter((l) => l.kind === "directory").map((l) => l.url), ...p.entities.map((e) => e.source), ...p.emails.map((e) => e.source)]
    .filter((u): u is string => !!u && /^https?:\/\//i.test(u))
    .filter((u, i, a) => a.indexOf(u) === i && FETCHABLE(u))
    .slice(0, 8);
  const pages = new Map<string, { html: string; status: number }>();
  for (const u of toOpen) {
    try {
      const page = await safeFetch(u, { fetchImpl: deps.fetchImpl, resolve: deps.resolve, timeoutMs: 8_000 });
      pages.set(u, { html: page.status < 400 ? page.html : "", status: page.status });
    } catch {
      /* unreachable pages stay unverified */
    }
  }
  const belongs = (u: string) => {
    const pg = pages.get(u);
    return !!pg?.html && pageMatches(pg.html, c);
  };
  const stateOf = (u: string): SiteState | "unreachable" => {
    const pg = pages.get(u);
    return pg?.html ? siteState(pg.html) : "unreachable";
  };

  // The website: an own domain (not a builder subdomain) that belongs to the company or carries its name.
  const own = siteCandidates.filter((u) => websiteKind(domainOf(u)) === "own" && !isBuilderSite(u));
  const accepted = own.find((u) => belongs(u)) ?? own.find((u) => pages.has(u) && domainCarriesName(domainOf(u), c.name)) ?? null;
  if (accepted) {
    out.website = accepted;
    const st = stateOf(accepted);
    out.websiteState = st === "unreachable" ? null : st;
    out.websiteFrom = p.website === accepted ? p.websiteFrom : (p.profiles.find((x) => x.website === accepted)?.kind ?? null);
  }
  out.otherSites = siteCandidates
    .filter((u) => u !== accepted && (isBuilderSite(u) || p.otherSites.some((o) => o.url === u)))
    .map((u) => ({ url: u, note: p.otherSites.find((o) => o.url === u)?.note ?? (isBuilderSite(u) ? "stran na graditelju strani" : null), state: pages.has(u) ? stateOf(u) : null }));

  const seen = new Set<string>();
  const push = (l: FoundLink) => {
    if (seen.has(l.url)) return;
    seen.add(l.url);
    out.links.push(l);
  };
  if (accepted) push({ url: accepted, kind: "website", source: "web_search", verified: belongs(accepted) || domainCarriesName(domainOf(accepted), c.name), note: out.websiteFrom });
  for (const x of p.profiles) {
    const bits = [x.handle ? `@${x.handle.replace(/^@/, "")}` : null, x.followers ? `${x.followers} sledilcev` : null].filter(Boolean).join(" · ");
    push({ url: x.url!, kind: x.kind, source: "web_search", verified: false, note: bits || null });
  }
  for (const o of out.otherSites) push({ url: o.url, kind: "other", source: "web_search", verified: belongs(o.url), note: o.note });
  for (const l of p.links) push({ url: l.url, kind: l.kind === "article" ? "other" : l.kind, source: "web_search", verified: FETCHABLE(l.url) ? belongs(l.url) : false, note: l.note });
  for (const e of p.entities) if (e.source) push({ url: e.source, kind: "directory", source: "web_search", verified: belongs(e.source), note: e.name });

  // E-mails: verified only when we saw them on a page that belongs to the company.
  const onPages = new Map<string, string>();
  for (const [u, pg] of pages) if (pg.html && pageMatches(pg.html, c)) for (const e of extractEmails(pg.html)) if (!IGNORE_EMAIL.test(e) && !onPages.has(e)) onPages.set(e, u);
  // Also published on the very page the researcher named as its source (e.g. a directory entry), which we opened.
  for (const e of p.emails) {
    const em = normalizeEmail(e.email);
    const src = e.source ? pages.get(e.source) : undefined;
    if (em && !IGNORE_EMAIL.test(em) && !onPages.has(em) && src?.html && extractEmails(src.html).includes(em)) onPages.set(em, e.source);
  }
  for (const [e, u] of onPages) out.emails.push({ email: e, source: u });
  for (const e of p.emails) {
    const em = normalizeEmail(e.email);
    if (!em || IGNORE_EMAIL.test(em) || onPages.has(em)) continue;
    out.candidates.push({ email: em, source: e.source });
  }
  return out;
}
