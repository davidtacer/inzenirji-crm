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
  "places.primaryType",
  "places.location",
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
  primaryType?: string;
  location?: { latitude?: number; longitude?: number };
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
  placeType: string | null;
  lat: number | null;
  lng: number | null;
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
    placeType: p.primaryType ?? null,
    lat: typeof p.location?.latitude === "number" ? p.location.latitude : null,
    lng: typeof p.location?.longitude === "number" ? p.location.longitude : null,
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

export const NEARBY_ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";
export const NEARBY_FIELD_MASK = PLACES_FIELD_MASK.split(",").filter((f) => f !== "nextPageToken").join(",");

/** Nearby search: same primary type within `radiusM`, ranked by distance (TASK-022). */
export async function searchNearby(
  input: { lat: number; lng: number; type: string; radiusM?: number; max?: number },
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Place[]> {
  const res = await fetchImpl(NEARBY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": NEARBY_FIELD_MASK },
    body: JSON.stringify({
      includedTypes: [input.type],
      maxResultCount: input.max ?? 20,
      rankPreference: "DISTANCE",
      languageCode: "sl",
      regionCode: "SI",
      locationRestriction: { circle: { center: { latitude: input.lat, longitude: input.lng }, radius: input.radiusM ?? 2000 } },
    }),
  });
  if (!res.ok) throw new PlacesError(res.status);
  const data = (await res.json()) as { places?: RawPlace[] };
  return (data.places ?? []).map(mapPlace).filter((p): p is Place => p !== null);
}

/** Location and primary type of one place (for companies found before TASK-022 stored them). */
export async function placeLocation(
  placeId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ lat: number; lng: number; type: string | null } | null> {
  const res = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "location,primaryType" },
  });
  if (!res.ok) throw new PlacesError(res.status);
  const d = (await res.json()) as { location?: { latitude?: number; longitude?: number }; primaryType?: string };
  if (typeof d.location?.latitude !== "number" || typeof d.location?.longitude !== "number") return null;
  return { lat: d.location.latitude, lng: d.location.longitude, type: d.primaryType ?? null };
}

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export type PlaceReview = { rating: number | null; text: string; when: string | null };
export type PlaceProfile = {
  lat: number | null;
  lng: number | null;
  type: string | null;
  businessStatus: string | null;
  summary: string | null;
  mapsUrl: string | null;
  periods: { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } }[];
  hoursText: string[];
  reviews: PlaceReview[];
};

/**
 * Place Details for one good business (TASK-023): location/type (for competitors), opening hours, status,
 * Google's short description and up to 5 recent reviews (text only, no reviewer names), in Slovenian when available.
 * One call; the caller reserves it against the daily cap.
 */
export async function placeProfile(placeId: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<PlaceProfile> {
  const res = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=sl`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "location,primaryType,businessStatus,editorialSummary,googleMapsUri,regularOpeningHours,reviews",
    },
  });
  if (!res.ok) throw new PlacesError(res.status);
  const d = (await res.json()) as {
    location?: { latitude?: number; longitude?: number };
    primaryType?: string;
    businessStatus?: string;
    editorialSummary?: { text?: string };
    googleMapsUri?: string;
    regularOpeningHours?: { periods?: PlaceProfile["periods"]; weekdayDescriptions?: string[] };
    reviews?: { rating?: number; text?: { text?: string }; originalText?: { text?: string }; relativePublishTimeDescription?: string }[];
  };
  return {
    lat: typeof d.location?.latitude === "number" ? d.location.latitude : null,
    lng: typeof d.location?.longitude === "number" ? d.location.longitude : null,
    type: d.primaryType ?? null,
    businessStatus: d.businessStatus ?? null,
    summary: d.editorialSummary?.text ?? null,
    mapsUrl: d.googleMapsUri ?? null,
    periods: d.regularOpeningHours?.periods ?? [],
    hoursText: d.regularOpeningHours?.weekdayDescriptions ?? [],
    reviews: (d.reviews ?? [])
      .map((r) => ({
        rating: typeof r.rating === "number" ? r.rating : null,
        text: (r.originalText?.text ?? r.text?.text ?? "").trim().slice(0, 500),
        when: r.relativePublishTimeDescription ?? null,
      }))
      .filter((r) => r.text)
      .slice(0, 5),
  };
}
