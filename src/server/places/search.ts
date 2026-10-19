import type { Db } from "../db/client";
import { searchTextPage, type Place } from "./client";
import { importPlaces, type ImportResult } from "./import";
import { QuotaError, reserveCall } from "./quota";

export const PLACES_PROVIDER = "google_places";

export type SearchInput = { query: string; pages: number };
export type SearchResult = Omit<ImportResult, "ids"> & { found: number; calls: number; stoppedByQuota: boolean };

export function validateSearch(raw: { query?: unknown; pages?: unknown }): SearchInput | null {
  const query = typeof raw.query === "string" ? raw.query.trim().replace(/\s+/g, " ") : "";
  const pages = Number(raw.pages ?? 1);
  if (query.length < 3 || query.length > 100) return null;
  if (!Number.isInteger(pages) || pages < 1 || pages > 3) return null;
  return { query, pages };
}

/** Runs up to `pages` pages, reserving one call from the daily cap before each, then stores the results. */
export async function runPlacesSearch(
  db: Db,
  input: SearchInput,
  deps: { apiKey: string; dailyCap: number; fetchImpl?: typeof fetch },
): Promise<SearchResult> {
  const all: Place[] = [];
  let token: string | undefined;
  let calls = 0;
  let stoppedByQuota = false;
  for (let i = 0; i < input.pages; i++) {
    try {
      await reserveCall(db, PLACES_PROVIDER, deps.dailyCap);
    } catch (e) {
      if (e instanceof QuotaError) {
        stoppedByQuota = true;
        break;
      }
      throw e;
    }
    calls++;
    const page = await searchTextPage({ query: input.query, pageToken: token }, deps.apiKey, deps.fetchImpl);
    all.push(...page.places);
    if (!page.nextPageToken) break;
    token = page.nextPageToken;
  }
  const { created, updated } = await importPlaces(db, all);
  if (calls) {
    const { logSearch } = await import("./smart");
    await logSearch(db, { query: input.query, pages: calls, found: all.length, created, updated });
  }
  return { created, updated, found: all.length, calls, stoppedByQuota };
}
