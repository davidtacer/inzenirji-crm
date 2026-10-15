/**
 * Google Places API (New) — Text Search (TASK-005).
 * Only the fields we store are requested (field mask), which keeps the billed SKU as low as possible.
 */
export const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

export const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.primaryTypeDisplayName",
  "places.googleMapsUri",
  "places.businessStatus",
  "nextPageToken",
].join(",");

export type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: { longText?: string; types?: string[] }[];
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  primaryTypeDisplayName?: { text?: string };
  googleMapsUri?: string;
  businessStatus?: string;
};

export type Place = {
  placeId: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  ratingX10: number | null;
  reviewCount: number | null;
  category: string | null;
  mapsUrl: string | null;
};

export class PlacesError extends Error {
  constructor(public readonly status: number) {
    super(`PLACES_ERROR_${status}`);
  }
}

/** Maps a raw result to our shape. Closed businesses and results without id/name are dropped (null). */
export function mapPlace(p: RawPlace): Place | null {
  const name = p.displayName?.text?.trim();
  if (!p.id || !name) return null;
  if (p.businessStatus && p.businessStatus !== "OPERATIONAL") return null;
  const city =
    p.addressComponents?.find((c) => c.types?.includes("locality"))?.longText ??
    p.addressComponents?.find((c) => c.types?.includes("postal_town"))?.longText ??
    null;
  const rating = typeof p.rating === "number" ? Math.round(p.rating * 10) : null;
  return {
    placeId: p.id,
    name,
    address: p.formattedAddress ?? null,
    city,
    phone: p.nationalPhoneNumber?.trim() || null,
    website: p.websiteUri?.trim() || null,
    ratingX10: rating !== null && rating >= 0 && rating <= 50 ? rating : null,
    reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    category: p.primaryTypeDisplayName?.text ?? null,
    mapsUrl: p.googleMapsUri ?? null,
  };
}

export type SearchPage = { places: Place[]; nextPageToken: string | null };

/** One page (up to 20 results). Throws PlacesError with the HTTP status only — never the key or the body. */
export async function searchTextPage(
  input: { query: string; pageToken?: string; regionCode?: string; languageCode?: string },
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SearchPage> {
  const res = await fetchImpl(PLACES_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": PLACES_FIELD_MASK },
    body: JSON.stringify({
      textQuery: input.query,
      languageCode: input.languageCode ?? "sl",
      regionCode: input.regionCode ?? "SI",
      pageSize: 20,
      ...(input.pageToken ? { pageToken: input.pageToken } : {}),
    }),
  });
  if (!res.ok) throw new PlacesError(res.status);
  const data = (await res.json()) as { places?: RawPlace[]; nextPageToken?: string };
  return {
    places: (data.places ?? []).map(mapPlace).filter((p): p is Place => p !== null),
    nextPageToken: data.nextPageToken ?? null,
  };
}
