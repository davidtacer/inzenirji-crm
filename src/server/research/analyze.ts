/** Pure HTML checks for one company website (TASK-006). No network, no AI. */

export type SiteFacts = {
  cms: string | null;
  cmsVersion: string | null;
  copyrightYear: number | null;
  hasViewport: boolean;
  title: string | null;
  description: string | null;
  h1Count: number;
  hasJsonLd: boolean;
  hasLocalBusiness: boolean;
  emails: string[];
  socials: Record<string, string>;
  phones: string[];
  bytes: number;
};

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&copy;/gi, "©").trim();

function meta(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "") || null : null;
}

const CMS: [string, RegExp][] = [
  ["WordPress", /wp-content\/|wp-includes\//i],
  ["Wix", /static\.wixstatic\.com|wix-code|_wixCIDX/i],
  ["Squarespace", /static1\.squarespace\.com|squarespace-cdn/i],
  ["Shopify", /cdn\.shopify\.com/i],
  ["Webflow", /webflow\.js|assets\.website-files\.com|data-wf-page/i],
  ["Joomla", /\/media\/jui\/|\/components\/com_/i],
  ["Jimdo", /jimdo(?:cdn)?\.com/i],
  ["Weebly", /weebly\.com|editmysite\.com/i],
  ["GoDaddy", /img1\.wsimg\.com/i],
  ["Drupal", /\/sites\/default\/files\/|Drupal\.settings/i],
];

const SOCIAL_HOSTS: Record<string, RegExp> = {
  facebook: /https?:\/\/(?:www\.|m\.)?facebook\.com\/[^"'\s<>?#]+/i,
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/[^"'\s<>?#]+/i,
  linkedin: /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[^"'\s<>?#]+/i,
  tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/@[^"'\s<>?#]+/i,
  youtube: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)[^"'\s<>?#]+/i,
};

const BAD_EMAIL = /\.(png|jpe?g|gif|webp|svg|css|js)$|@(example|domain|sentry|wixpress|sentry-next)\.|^(name|email|your|vas|vaš)@/i;

/** Cloudflare "email protection": first byte is the XOR key for the rest. */
export function decodeCfEmail(hex: string): string | null {
  if (!/^[0-9a-f]{4,}$/i.test(hex) || hex.length % 2) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/**
 * Every address the page publishes: mailto links, plain text, HTML entities, Cloudflare-protected addresses,
 * JSON-LD "email", and the common "info [at] salon [dot] si" / "info(at)salon.si" spellings.
 */
export function extractEmails(html: string, text?: string): string[] {
  const found = new Set<string>();
  const add = (e: string) => found.add(e.trim().toLowerCase().replace(/^mailto:/, ""));
  const body = text ?? decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
  for (const m of decode(html).matchAll(/mailto:([^"'?\s>]+)/gi)) {
    try {
      add(decodeURIComponent(m[1]));
    } catch {
      add(m[1]);
    }
  }
  for (const m of body.matchAll(EMAIL_RE)) add(m[0]);
  for (const m of html.matchAll(/data-cfemail=["']([0-9a-f]+)["']|email-protection#([0-9a-f]+)/gi)) {
    const e = decodeCfEmail(m[1] ?? m[2]);
    if (e) add(e);
  }
  for (const m of html.matchAll(/"email"\s*:\s*"([^"]+)"/gi)) add(m[1]);
  const deobf = body
    .replace(/\s*[[({]\s*(?:at|afna)\s*[\])}]\s*/gi, "@")
    .replace(/\s*[[({]\s*(?:dot|pika)\s*[\])}]\s*/gi, ".");
  if (deobf !== body) for (const m of deobf.matchAll(EMAIL_RE)) add(m[0]);
  return [...found].filter((e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) && !BAD_EMAIL.test(e)).sort();
}

const CONTACT_LINK = /kontakt|contact|o-nas|o_nas|onas|about|o-podjetju|podjetje|impressum|pravn|kje-smo|lokacij|informacij/i;

/** Internal links to pages where businesses usually publish the address (contact, about, imprint). */
export function contactLinks(html: string, baseUrl: string, max = 4): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const host = base.hostname.replace(/^www\./, "");
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (out.length >= max) break;
    const href = decode(m[1]);
    const label = m[2].replace(/<[^>]+>/g, " ");
    if (!CONTACT_LINK.test(href) && !CONTACT_LINK.test(label)) continue;
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, "") !== host) continue;
    if (/\.(pdf|jpe?g|png|gif|webp|zip|docx?)$/i.test(u.pathname)) continue;
    u.hash = "";
    const key = u.toString().replace(/\/$/, "");
    if (key === base.toString().replace(/\/$/, "") || out.includes(key)) continue;
    out.push(key);
  }
  return out;
}

/** Visible text of a page (for hours and, later, the AI remark). */
export function pageText(html: string): string {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .trim();
}

export function analyzeHtml(html: string): SiteFacts {
  const generator = meta(html, "generator");
  let cms: string | null = null;
  let cmsVersion: string | null = null;
  if (generator) {
    const m = generator.match(/^([A-Za-z][A-Za-z .-]*?)\s*v?(\d+(?:\.\d+)*)?$/);
    cms = m?.[1]?.trim() || generator;
    cmsVersion = m?.[2] ?? null;
  }
  if (!cms) cms = CMS.find(([, re]) => re.test(html))?.[0] ?? null;
  else {
    const known = CMS.find(([n]) => cms!.toLowerCase().startsWith(n.toLowerCase()));
    if (known) cms = known[0];
  }

  const text = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
  const years = [...text.matchAll(/(?:©|copyright|\(c\))\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)].map((m) => Number(m[1]));
  const ranges = [...text.matchAll(/(?:©|copyright|\(c\))\s*(?:19|20)\d{2}\s*[-–]\s*((?:19|20)\d{2})/gi)].map((m) => Number(m[1]));
  const allYears = [...years, ...ranges];
  const copyrightYear = allYears.length ? Math.max(...allYears) : null;

  const cleanEmails = extractEmails(html, text);

  const socials: Record<string, string> = {};
  for (const [k, re] of Object.entries(SOCIAL_HOSTS)) {
    const m = html.match(re)?.[0];
    if (m && !/sharer|share\.php|\/plugins\/|\/tr\?|intent\//i.test(m)) socials[k] = m.replace(/\/$/, "");
  }

  const phones = new Set<string>();
  for (const m of html.matchAll(/tel:([+\d\s().-]{6,})/gi)) phones.add(m[1].replace(/\D/g, "").replace(/^386/, "0"));

  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || null;
  return {
    cms,
    cmsVersion,
    copyrightYear,
    hasViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    title,
    description: meta(html, "description"),
    h1Count: (html.match(/<h1[\s>]/gi) ?? []).length,
    hasJsonLd: /<script[^>]+application\/ld\+json/i.test(html),
    hasLocalBusiness: /"@type"\s*:\s*"(LocalBusiness|Restaurant|HairSalon|BeautySalon|Store|ProfessionalService|MedicalBusiness|Dentist|AutoRepair|Hotel|[A-Za-z]*Business)"/.test(html),
    emails: cleanEmails,
    socials,
    phones: [...phones].filter((p) => p.length >= 6),
    bytes: html.length,
  };
}

export type Issue = { code: string; severity: "high" | "medium" | "low"; text: string };

/** Problems worth mentioning in outreach, in Slovenian, most important first. */
export function findIssues(
  f: SiteFacts | null,
  ctx: {
    kind: "own" | "social" | "link" | "none";
    https?: boolean;
    ms?: number;
    status?: number;
    googlePhoneDigits?: string;
    nowYear: number;
    /** Sentence from hoursMismatch() (TASK-023). */
    hoursMismatch?: string | null;
    closedPermanently?: boolean;
    /** What the domain shows (siteState) and the domain, for the text. */
    state?: SiteState;
    domain?: string | null;
  },
): Issue[] {
  const out: Issue[] = [];
  if (ctx.closedPermanently) return [{ code: "closed", severity: "high", text: "Na Googlu je podjetje označeno kot trajno zaprto." }];
  if (ctx.state === "under_construction")
    return [{ code: "site_under_construction", severity: "high", text: `Na domeni ${ctx.domain ?? ""} piše, da je stran v izdelavi — prave strani še nimajo.`.replace("  ", " ") }];
  if (ctx.state === "parked")
    return [{ code: "site_parked", severity: "high", text: `Domena ${ctx.domain ?? ""} nima prave strani (parkirana ali privzeta stran gostitelja).`.replace("  ", " ") }];
  if (ctx.kind === "none") return [{ code: "no_website", severity: "high", text: "Podjetje nima spletne strani." }];
  if (ctx.kind === "social") return [{ code: "social_only", severity: "high", text: "Namesto spletne strani ima samo profil na družbenem omrežju." }];
  if (ctx.kind === "link") return [{ code: "link_only", severity: "high", text: "Namesto spletne strani ima samo stran s povezavami (link-in-bio)." }];
  if (!f || (ctx.status ?? 0) >= 400) return [{ code: "unreachable", severity: "high", text: "Spletna stran se ne odpre ali vrača napako." }];
  if (ctx.hoursMismatch) out.push({ code: "hours_mismatch", severity: "high", text: ctx.hoursMismatch });
  if (!f.hasViewport) out.push({ code: "not_mobile", severity: "high", text: "Stran ni prilagojena za telefone." });
  if (f.copyrightYear && f.copyrightYear <= ctx.nowYear - 3)
    out.push({ code: "old_year", severity: "medium", text: `V nogi strani piše letnica ${f.copyrightYear}.` });
  if (ctx.https === false) out.push({ code: "no_https", severity: "medium", text: "Stran ne uporablja varne povezave (HTTPS)." });
  if ((ctx.ms ?? 0) > 3000) out.push({ code: "slow", severity: "medium", text: `Stran se je nalagala ${(ctx.ms! / 1000).toFixed(1).replace(".", ",")} s.` });
  if (f.cms === "WordPress" || f.cms === "Wix" || f.cms === "Joomla")
    out.push({ code: "cms", severity: "low", text: `Stran teče na sistemu ${f.cms}${f.cmsVersion ? ` ${f.cmsVersion}` : ""}.` });
  if (ctx.googlePhoneDigits && f.phones.length > 0 && !f.phones.includes(ctx.googlePhoneDigits.replace(/^386/, "0")))
    out.push({ code: "phone_mismatch", severity: "medium", text: "Telefon na strani se razlikuje od telefona na Google profilu." });
  if (!f.description) out.push({ code: "no_description", severity: "low", text: "Stran nima opisa za Google (meta description)." });
  if (f.h1Count === 0) out.push({ code: "no_h1", severity: "low", text: "Stran nima glavnega naslova (H1)." });
  if (!f.hasJsonLd) out.push({ code: "no_structured_data", severity: "low", text: "Stran nima strukturiranih podatkov, ki jih berejo Google in ChatGPT." });
  return out;
}

export type SiteState = "live" | "under_construction" | "parked";

const UNDER_CONSTRUCTION = /(stran je v izdelavi|v izdelavi|spletna stran v pripravi|v pripravi|kmalu na voljo|kmalu prihajamo|pride kmalu|under construction|coming soon|website is coming|launching soon|maintenance mode|we'?ll be back soon|site is under maintenance|baustelle|in bearbeitung)/i;
const PARKED = /(domain (is )?for sale|this domain (is|has been) (registered|parked)|domena je naprodaj|domena je registrirana|parked (free|domain)|buy this domain|domain parking|sedo|default web ?page|it works!|welcome to nginx|apache2? (ubuntu )?default page|index of \/|cpanel|plesk|hosting za to domeno|ta domena je)/i;

/**
 * What a domain actually shows (TASK-034): a real site, a "v izdelavi / coming soon" page, or a parked/default
 * page. Only short pages count as under construction or parked, so a real site that mentions "v pripravi" stays live.
 */
export function siteState(html: string): SiteState {
  const text = pageText(html);
  if (text.length < 1500 && UNDER_CONSTRUCTION.test(text)) return "under_construction";
  if (text.length < 2500 && PARKED.test(`${text} ${html.slice(0, 3000)}`)) return "parked";
  return "live";
}

/** Group A = has an own site that we can move to our framework; B = needs a (new) site. */
const GOOD_LOCAL = /^(info|kontakt|contact|hello|pozdrav|pisarna|office|salon|rezervacij[ae]|narocila|naročila|booking|studio|recepcija|prodaja|mail)$/;

/** Best address first: the site's own domain, then a typical shop mailbox, then the rest. */
export function rankEmails(emails: string[], siteDomain: string | null): string[] {
  const rank = (e: string) => {
    const [local, domain] = e.split("@");
    const own = siteDomain && (domain === siteDomain || domain.endsWith(`.${siteDomain}`)) ? 0 : 2;
    return own + (GOOD_LOCAL.test(local) ? 0 : 1);
  };
  return [...new Set(emails)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function proposeGroup(kind: "own" | "social" | "link" | "none", reachable: boolean): "A" | "B" {
  return kind === "own" && reachable ? "A" : "B";
}

export function summarize(issues: Issue[], group: "A" | "B"): string {
  const head = group === "A" ? "Skupina A (prenos) — ima stran, primerna za prenos na urejevalnik." : "Skupina B (nova stran) — rabi novo spletno stran.";
  const top = issues.filter((i) => i.severity !== "low").slice(0, 3).map((i) => i.text);
  return top.length ? `${head} ${top.join(" ")}` : `${head} Večjih težav nismo našli.`;
}
