/** Site id (TASK-039): `a-z0-9-`, derived from the domain (`vodniskuter.si` → `vodniskuter-si`), never changed after the repo exists. */

const SLO: Record<string, string> = { č: "c", š: "s", ž: "z", ć: "c", đ: "d" };

export const SITE_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SITE_ID_MAX = 50;

export function validSiteId(id: string): boolean {
  return id.length >= 3 && id.length <= SITE_ID_MAX && SITE_ID_RE.test(id);
}

/** Proposal from a domain, URL or company name. Empty string when nothing usable is left. */
export function deriveSiteId(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] ?? "";
  s = s.replace(/[čšžćđ]/g, (c) => SLO[c] ?? c).normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, SITE_ID_MAX).replace(/-+$/g, "");
}

/** Cloudflare Pages project names for a site (guide §19.2). */
export const pagesProjects = (siteId: string) => ({ live: siteId, dev: `${siteId}-dev` });
