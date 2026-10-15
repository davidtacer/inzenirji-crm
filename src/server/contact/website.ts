/** Domains that are not an own website: social profiles and link-in-bio pages (group B: "needs a site"). */
const SOCIAL = ["facebook.com", "fb.com", "fb.me", "instagram.com", "tiktok.com", "linkedin.com", "youtube.com", "x.com", "twitter.com"];
const LINK_PAGES = ["linktr.ee", "onelink.to", "linkin.bio", "beacons.ai", "lnk.bio", "taplink.cc", "bio.link", "carrd.co", "wa.me"];

export type WebsiteKind = "own" | "social" | "link" | "none";

const matches = (domain: string, list: string[]) => list.some((d) => domain === d || domain.endsWith(`.${d}`));

export function websiteKind(domain: string | null | undefined): WebsiteKind {
  if (!domain) return "none";
  const d = domain.toLowerCase();
  if (matches(d, SOCIAL)) return "social";
  if (matches(d, LINK_PAGES)) return "link";
  return "own";
}

/** SQL-friendly lists for counting companies without an own website. */
export const NOT_OWN_WEBSITE_DOMAINS = [...SOCIAL, ...LINK_PAGES];
