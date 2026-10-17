import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { settings } from "../db/schema";
import { decrypt, encrypt } from "../google/crypto";

/*
 * Meta Ads numbers for the weekly report (TASK-015, ADR-042). The owner pastes a read-only access token (system
 * user with `ads_read`) and the ad account id in Nastavitve; the token is stored encrypted. The report asks the
 * Marketing API Insights endpoint for the week's date range, so no daily snapshots are needed.
 */

export const GRAPH = "https://graph.facebook.com/v25.0";
const KEY = "metaAds";
const secret = () => process.env.BETTER_AUTH_SECRET ?? "";

export type MetaConfig = { token: string; accountId: string };

/** "act_123", "123" or a pasted Ads Manager URL with act=123 → "123". */
export function parseAccountId(v: string): string | null {
  const m = v.trim().match(/(?:act[_=])?(\d{6,20})/);
  return m ? m[1] : null;
}

export async function saveMeta(db: Db, input: { token?: string | null; accountId?: string | null }, now = new Date()) {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
  const old = (row?.value ?? {}) as { enc?: string | null; accountId?: string | null };
  const value = { enc: input.token ? encrypt(input.token.trim(), secret()) : (old.enc ?? null), accountId: input.accountId ?? old.accountId ?? null };
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } });
}

export async function metaConfig(db: Db): Promise<MetaConfig | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
  const v = row?.value as { enc?: string | null; accountId?: string | null } | undefined;
  if (!v?.enc || !v.accountId) return null;
  try {
    return { token: decrypt(v.enc, secret()), accountId: v.accountId };
  } catch {
    return null;
  }
}

export async function metaStatus(db: Db): Promise<{ token: boolean; accountId: string | null }> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
  const v = row?.value as { enc?: string | null; accountId?: string | null } | undefined;
  return { token: !!v?.enc, accountId: v?.accountId ?? null };
}

export class MetaError extends Error {
  constructor(
    public status: number,
    public detail: string | null,
  ) {
    super(`META_HTTP_${status}`);
  }
}

async function get(cfg: MetaConfig, path: string, params: Record<string, string>, fetchImpl: typeof fetch) {
  const q = new URLSearchParams(params);
  // The token goes in a header, never in the URL (logs, proxies).
  const res = await fetchImpl(`${GRAPH}/${path}?${q}`, { headers: { Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(30_000) });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & Record<string, unknown>;
  if (!res.ok || body.error) throw new MetaError(res.status, body.error?.message?.slice(0, 200) ?? null);
  return body;
}

/** Account name and currency, for "Preveri povezavo". */
export async function checkAccount(cfg: MetaConfig, fetchImpl: typeof fetch = fetch): Promise<{ name: string; currency: string }> {
  const b = (await get(cfg, `act_${cfg.accountId}`, { fields: "name,currency" }, fetchImpl)) as { name?: string; currency?: string };
  return { name: b.name ?? "", currency: b.currency ?? "" };
}

export type Campaign = { name: string; spendCents: number; impressions: number; clicks: number; leads: number };
export type AdsWeek = { spendCents: number; currency: string; impressions: number; clicks: number; leads: number; campaigns: Campaign[] };

type Action = { action_type?: string; value?: string };

/** Lead action types Meta reports (lead forms, website pixel "Lead", on-site leads); the aggregate "lead" type wins. */
export const LEAD_TYPES = ["offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped", "onsite_web_lead", "leadgen_grouped", "onsite_conversion.lead"];

export function leadsFrom(actions: Action[] | undefined): number {
  const by = new Map((actions ?? []).map((a) => [a.action_type ?? "", Number(a.value ?? 0) || 0]));
  if (by.has("lead")) return by.get("lead")!;
  // Several of these can describe the same lead; take the largest rather than adding them up.
  return Math.max(0, ...LEAD_TYPES.map((t) => by.get(t) ?? 0));
}

/** Spend, reach and leads per campaign for a date range (inclusive, account time zone). */
export async function insights(cfg: MetaConfig, since: string, until: string, fetchImpl: typeof fetch = fetch): Promise<AdsWeek> {
  const b = (await get(
    cfg,
    `act_${cfg.accountId}/insights`,
    { level: "campaign", fields: "campaign_name,spend,impressions,clicks,actions,account_currency", time_range: JSON.stringify({ since, until }), limit: "100" },
    fetchImpl,
  )) as { data?: { campaign_name?: string; spend?: string; impressions?: string; clicks?: string; actions?: Action[]; account_currency?: string }[] };
  const rows = b.data ?? [];
  const campaigns = rows
    .map((r) => ({
      name: r.campaign_name ?? "?",
      spendCents: Math.round((Number(r.spend ?? 0) || 0) * 100),
      impressions: Number(r.impressions ?? 0) || 0,
      clicks: Number(r.clicks ?? 0) || 0,
      leads: leadsFrom(r.actions),
    }))
    .sort((a, b) => b.spendCents - a.spendCents);
  const sum = (k: keyof Omit<Campaign, "name">) => campaigns.reduce((a, c) => a + c[k], 0);
  return { spendCents: sum("spendCents"), currency: rows[0]?.account_currency ?? "EUR", impressions: sum("impressions"), clicks: sum("clicks"), leads: sum("leads"), campaigns };
}

export function metaMessage(e: unknown): string {
  if (e instanceof MetaError) {
    if (e.status === 401 || /token|session|OAuth/i.test(e.detail ?? "")) return "Meta ni sprejela ključa (žeton je potekel ali je napačen). Ustvari novega in ga shrani v Nastavitvah.";
    if (e.status === 403 || /permission/i.test(e.detail ?? "")) return "Ključ nima dostopa do tega oglasnega računa (potrebna je pravica ads_read).";
    return `Meta je vrnila napako ${e.status}${e.detail ? `: ${e.detail}` : ""}.`;
  }
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "Meta se ni odzvala v 30 sekundah." : "Branje Meta oglasov ni uspelo.";
}
