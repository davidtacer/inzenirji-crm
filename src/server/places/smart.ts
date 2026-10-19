import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { placesSearches } from "../db/schema";
import { activityByKey, type PlannedQuery, planQueries, regionOf } from "./catalog";
import { searchTextPage } from "./client";
import { importPlaces } from "./import";
import { QuotaError, reserveCall } from "./quota";
import { PLACES_PROVIDER } from "./search";

/*
 * Smart search (owner 2026-10-19: "malo bolj pametno iskanje, da z minimalnim trudom dobimo čimveč leadov").
 * The owner picks an activity and a town; the CRM runs the synonyms, city parts and (optionally) the region's other
 * towns, skips queries run in the last 90 days, reads a 2nd/3rd page only while a page still brings mostly new
 * companies, stops at the call budget or the daily cap, and logs every query.
 */

export const SKIP_DAYS = 90;
/** Read the next page only when this share of the page was new. */
export const NEXT_PAGE_NEW_SHARE = 0.5;

export type SmartInput = { activity: string; town: string; nearby: boolean; budget: number };
export type SmartResult = { queries: number; skipped: number; calls: number; created: number; updated: number; stoppedByQuota: boolean; left: number };

export async function recentQueries(db: Db, since: Date): Promise<Set<string>> {
  const rows = await db.select({ q: placesSearches.query }).from(placesSearches).where(gte(placesSearches.at, since));
  return new Set(rows.map((r) => r.q.toLowerCase()));
}

export async function logSearch(db: Db, row: { query: string; activity?: string | null; town?: string | null; pages: number; found: number; created: number; updated: number }, now = new Date()) {
  await db.insert(placesSearches).values({ ...row, activity: row.activity ?? null, town: row.town ?? null, at: now });
}

export async function runSmartSearch(
  db: Db,
  input: SmartInput,
  deps: { apiKey: string; dailyCap: number; fetchImpl?: typeof fetch; now?: Date },
  progress?: (p: { done: number; total: number; created: number }) => Promise<void>,
): Promise<SmartResult> {
  const now = deps.now ?? new Date();
  const act = activityByKey(input.activity);
  if (!act || !regionOf(input.town)) throw new Error("SMART_BAD_INPUT");
  const done = await recentQueries(db, new Date(now.getTime() - SKIP_DAYS * 86_400_000));
  const plan = planQueries(act, input.town, input.nearby);
  const todo: PlannedQuery[] = plan.filter((q) => !done.has(q.query.toLowerCase()));
  const res: SmartResult = { queries: 0, skipped: plan.length - todo.length, calls: 0, created: 0, updated: 0, stoppedByQuota: false, left: 0 };
  let i = 0;
  for (; i < todo.length && res.calls < input.budget && !res.stoppedByQuota; i++) {
    const q = todo[i]!;
    let token: string | undefined;
    let pages = 0;
    const tally = { found: 0, created: 0, updated: 0 };
    for (let page = 0; page < 3 && res.calls < input.budget; page++) {
      try {
        await reserveCall(db, PLACES_PROVIDER, deps.dailyCap, now);
      } catch (e) {
        if (e instanceof QuotaError) {
          res.stoppedByQuota = true;
          break;
        }
        throw e;
      }
      res.calls++;
      pages++;
      const r = await searchTextPage({ query: q.query, pageToken: token }, deps.apiKey, deps.fetchImpl);
      const imp = await importPlaces(db, r.places);
      tally.found += r.places.length;
      tally.created += imp.created;
      tally.updated += imp.updated;
      if (!r.nextPageToken || r.places.length === 0 || imp.created / r.places.length < NEXT_PAGE_NEW_SHARE) break;
      token = r.nextPageToken;
    }
    if (pages === 0) break;
    res.queries++;
    res.created += tally.created;
    res.updated += tally.updated;
    await logSearch(db, { query: q.query, activity: act.key, town: q.town, pages, ...tally }, now);
    await progress?.({ done: i + 1, total: todo.length, created: res.created });
  }
  res.left = todo.length - i;
  return res;
}

export type HistoryRow = { activity: string | null; town: string | null; queries: number; created: number; found: number; last: Date; lastCreated: number };

/** What was searched, per activity and town (manual queries grouped under their text). */
export async function searchHistory(db: Db, limit = 60): Promise<HistoryRow[]> {
  const rows = (await db.execute(sql`
    select coalesce(activity, '') as activity, coalesce(town, query) as town, count(*)::int as queries,
      coalesce(sum(created), 0)::int as created, coalesce(sum(found), 0)::int as found, max(at) as last,
      (array_agg(created order by at desc))[1]::int as "lastCreated"
    from places_searches group by 1, 2 order by max(at) desc limit ${limit}`)) as unknown as (Omit<HistoryRow, "last"> & { last: string | Date })[];
  return rows.map((r) => ({ ...r, activity: r.activity || null, last: new Date(r.last) }));
}

/** Towns of the same regions not searched yet for an activity: where to look next. */
export async function nextTowns(db: Db, activity: string, limit = 8): Promise<string[]> {
  const rows = await db.selectDistinct({ town: placesSearches.town }).from(placesSearches).where(and(eq(placesSearches.activity, activity)));
  const searched = new Set(rows.map((r) => r.town).filter(Boolean) as string[]);
  const regions = [...new Set([...searched].map((t) => regionOf(t)?.key).filter(Boolean))];
  const { REGIONS } = await import("./catalog");
  return REGIONS.filter((r) => regions.includes(r.key))
    .flatMap((r) => r.towns)
    .filter((t) => !searched.has(t))
    .slice(0, limit);
}

/** Last activity used, to pre-select the form. */
export async function lastActivity(db: Db): Promise<{ activity: string; town: string } | null> {
  const [r] = await db
    .select({ activity: placesSearches.activity, town: placesSearches.town })
    .from(placesSearches)
    .where(sql`${placesSearches.activity} is not null`)
    .orderBy(desc(placesSearches.at))
    .limit(1);
  return r?.activity && r.town ? { activity: r.activity, town: r.town } : null;
}
