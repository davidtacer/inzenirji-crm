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
  s.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&copy;/gi, "©").trim();

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

  const emails = new Set<string>();
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) emails.add(decodeURIComponent(m[1]).toLowerCase());
  for (const m of text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) emails.add(m[0].toLowerCase());
  const cleanEmails = [...emails].filter((e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) && !BAD_EMAIL.test(e)).sort();

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
  ctx: { kind: "own" | "social" | "link" | "none"; https?: boolean; ms?: number; status?: number; googlePhoneDigits?: string; nowYear: number },
): Issue[] {
  const out: Issue[] = [];
  if (ctx.kind === "none") return [{ code: "no_website", severity: "high", text: "Podjetje nima spletne strani." }];
  if (ctx.kind === "social") return [{ code: "social_only", severity: "high", text: "Namesto spletne strani ima samo profil na družbenem omrežju." }];
  if (ctx.kind === "link") return [{ code: "link_only", severity: "high", text: "Namesto spletne strani ima samo stran s povezavami (link-in-bio)." }];
  if (!f || (ctx.status ?? 0) >= 400) return [{ code: "unreachable", severity: "high", text: "Spletna stran se ne odpre ali vrača napako." }];
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

/** Group A = has an own site that we can move to our framework; B = needs a (new) site. */
export function proposeGroup(kind: "own" | "social" | "link" | "none", reachable: boolean): "A" | "B" {
  return kind === "own" && reachable ? "A" : "B";
}

export function summarize(issues: Issue[], group: "A" | "B"): string {
  const head = group === "A" ? "Skupina A (prenos) — ima stran, primerna za prenos na urejevalnik." : "Skupina B (nova stran) — rabi novo spletno stran.";
  const top = issues.filter((i) => i.severity !== "low").slice(0, 3).map((i) => i.text);
  return top.length ? `${head} ${top.join(" ")}` : `${head} Večjih težav nismo našli.`;
}
