import { decrypt } from "./crypto";
import { getAccount } from "./calendar";
import { GoogleError, oauthConfigFromEnv, type OAuthConfig, refreshAccessToken } from "./oauth";
import type { Db } from "../db/client";

/*
 * Google Search Console numbers for the weekly report (TASK-015, ADR-042), read with the owner's existing Google
 * connection (scope webmasters.readonly, added to the calendar connection; the owner reconnects once). The site is the
 * first verified property that contains "inzenirji". Google's data lags 2-3 days.
 */

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const API = "https://www.googleapis.com/webmasters/v3";

export type SearchRow = { key: string; clicks: number; impressions: number; position: number };
export type SearchWeek = { site: string; clicks: number; impressions: number; position: number | null; queries: SearchRow[]; pages: SearchRow[] };

async function call<T>(token: string, path: string, body: unknown | null, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new GoogleError(res.status);
  return (await res.json()) as T;
}

/** Our property: a domain property (sc-domain:inzenirji.si) is preferred over a URL prefix. */
export function pickSite(sites: { siteUrl?: string; permissionLevel?: string }[]): string | null {
  const ours = sites.map((s) => s.siteUrl ?? "").filter((u) => /inzenirji/i.test(u) && !/uredi|demo|crm/i.test(u));
  return ours.find((u) => u.startsWith("sc-domain:")) ?? ours.find((u) => /^https:\/\/www\./.test(u)) ?? ours[0] ?? null;
}

type Row = { keys?: string[]; clicks?: number; impressions?: number; position?: number };
const toRow = (r: Row): SearchRow => ({ key: r.keys?.[0] ?? "", clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, position: Math.round((r.position ?? 0) * 10) / 10 });

export async function searchWeek(token: string, start: string, end: string, fetchImpl: typeof fetch = fetch): Promise<SearchWeek | null> {
  const { siteEntry = [] } = await call<{ siteEntry?: { siteUrl?: string; permissionLevel?: string }[] }>(token, "/sites", null, fetchImpl);
  const site = pickSite(siteEntry);
  if (!site) return null;
  const q = (dimensions: string[], rowLimit: number) =>
    call<{ rows?: Row[] }>(token, `/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { startDate: start, endDate: end, dimensions, rowLimit }, fetchImpl);
  const [total, queries, pages] = await Promise.all([q([], 1), q(["query"], 10), q(["page"], 10)]);
  const t = total.rows?.[0];
  return {
    site,
    clicks: t?.clicks ?? 0,
    impressions: t?.impressions ?? 0,
    position: t?.position ? Math.round(t.position * 10) / 10 : null,
    queries: (queries.rows ?? []).map(toRow),
    pages: (pages.rows ?? []).map(toRow),
  };
}

/** With the stored Google connection; null = not connected or the connection lacks the Search Console scope. */
export async function searchWeekFromAccount(
  db: Db,
  start: string,
  end: string,
  opts: { cfg?: OAuthConfig | null; fetchImpl?: typeof fetch } = {},
): Promise<{ data: SearchWeek | null; error: string | null }> {
  const cfg = opts.cfg === undefined ? oauthConfigFromEnv() : opts.cfg;
  const acc = await getAccount(db);
  if (!cfg || !acc) return { data: null, error: "Google ni povezan (Nastavitve → Google)." };
  if (!acc.scope.includes(GSC_SCOPE)) return { data: null, error: "Za Search Console v Nastavitvah znova poveži Google." };
  try {
    const token = await refreshAccessToken(cfg, decrypt(acc.refreshTokenEnc, cfg.secret), opts.fetchImpl);
    const data = await searchWeek(token, start, end, opts.fetchImpl);
    return { data, error: data ? null : "V Search Console ni strani inzenirji.si (ali ni dostopa)." };
  } catch (e) {
    const s = e instanceof GoogleError ? e.status : 0;
    return { data: null, error: s === 403 ? "Search Console API ni vklopljen v Google Cloud ali ni dostopa do strani." : s === 400 || s === 401 ? "Povezava z Googlom je potekla - poveži znova v Nastavitvah." : "Branje Search Console ni uspelo." };
  }
}
