/** Domains that are not an own website: social profiles and link-in-bio pages (group B: "needs a site"). */
const SOCIAL = ["facebook.com", "fb.com", "fb.me", "instagram.com", "tiktok.com", "linkedin.com", "youtube.com", "x.com", "twitter.com"];
const LINK_PAGES = ["linktr.ee", "onelink.to", "linkin.bio", "beacons.ai", "lnk.bio", "taplink.cc", "bio.link", "carrd.co", "wa.me"];

/**
 * Directories and chamber catalogues (owner 2026-10-21: the OZS catalogue page was taken as a salon's website and
 * all 8 addresses on it were saved). A listing page is never a company's own website.
 */
export const DIRECTORY_SITES = [
  "ozs.si", "gzs.si", "bizi.si", "najdi.si", "itis.si", "imenik.si", "zlatestrani.si", "pirs.si", "doberfrizer.si", "cylex.si",
  "cylex-slovenija.si", "infobel.com", "hotfrog.si", "find-open.si", "toplocalplaces.com", "povezujemo.si", "visitcelje.eu",
  "moja-dejavnost.si", "mojastoritev.net", "mojastoritev.si", "ajpes.si", "companywall.si", "poslovni-imenik.si", "imenik-podjetij.si",
  "javnipodatki.si", "tripadvisor.com", "yelp.com", "treatwell.com", "fresha.com", "booksy.com", "salonsi.si", "frizerji.si",
  "lepotni-saloni.si", "e-creditreform.si", "moje-podjetje.si", "stop-neplacniki.si", "slovenia.info", "visitmaribor.si",
  "visitljubljana.com", "google.com", "maps.app.goo.gl", "goo.gl",
];

export type WebsiteKind = "own" | "social" | "link" | "none";

const matches = (domain: string, list: string[]) => list.some((d) => domain === d || domain.endsWith(`.${d}`));

export function websiteKind(domain: string | null | undefined): WebsiteKind {
  if (!domain) return "none";
  const d = domain.toLowerCase();
  if (matches(d, SOCIAL)) return "social";
  if (matches(d, LINK_PAGES)) return "link";
  // A listing in a directory is not a website at all: the company has none of its own.
  if (matches(d, DIRECTORY_SITES)) return "none";
  return "own";
}

/** SQL-friendly lists for counting companies without an own website. */
export const NOT_OWN_WEBSITE_DOMAINS = [...SOCIAL, ...LINK_PAGES, ...DIRECTORY_SITES];
export const isDirectorySite = (domain: string | null | undefined) => !!domain && matches(domain.toLowerCase(), DIRECTORY_SITES);
