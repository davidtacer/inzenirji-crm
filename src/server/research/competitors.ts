import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { companies } from "../db/schema";
import { distanceM, PlacesError, placeLocation, searchNearby } from "../places/client";
import { importPlaces } from "../places/import";
import { QuotaError, reserveCall } from "../places/quota";
import { PLACES_PROVIDER } from "../places/search";

export type PlacesDeps = { apiKey: string; dailyCap: number; fetchImpl?: typeof fetch; radiusM?: number };
export type Competitor = { id: string; distanceM: number };

type CompanyRow = typeof companies.$inferSelect;

/**
 * Real neighbours (TASK-022): Google Nearby Search for the same primary type within ~2 km, ranked by distance.
 * Every result is stored as a company (the database grows with each research). Returns the 5 nearest, or null when
 * it cannot run (no key, no place id, no type, daily cap reached, Google error) so the caller can fall back.
 */
export async function findNearbyCompetitors(db: Db, c: CompanyRow, deps: PlacesDeps): Promise<Competitor[] | null> {
  if (!deps.apiKey || !c.placeId) return null;
  try {
    let { lat, lng, placeType } = c;
    if (lat === null || lng === null || !placeType) {
      await reserveCall(db, PLACES_PROVIDER, deps.dailyCap);
      const loc = await placeLocation(c.placeId, deps.apiKey, deps.fetchImpl);
      if (!loc) return null;
      lat = loc.lat;
      lng = loc.lng;
      placeType = loc.type;
      await db.update(companies).set({ lat, lng, placeType }).where(eq(companies.id, c.id));
    }
    if (!placeType) return null;
    await reserveCall(db, PLACES_PROVIDER, deps.dailyCap);
    const nearby = await searchNearby({ lat, lng, type: placeType, radiusM: deps.radiusM ?? 2000 }, deps.apiKey, deps.fetchImpl);
    const others = nearby.filter((p) => p.placeId !== c.placeId && p.lat !== null && p.lng !== null);
    const { ids } = await importPlaces(db, others, c.country);
    return others
      .map((p) => ({ id: ids[p.placeId], distanceM: distanceM({ lat: lat!, lng: lng! }, { lat: p.lat!, lng: p.lng! }) }))
      .filter((x) => x.id && x.id !== c.id)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 5);
  } catch (e) {
    if (e instanceof QuotaError || e instanceof PlacesError) return null;
    throw e;
  }
}
