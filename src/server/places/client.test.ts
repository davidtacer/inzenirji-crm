import { describe, expect, it } from "vitest";
import { mapPlace, PLACES_ENDPOINT, PLACES_FIELD_MASK, PlacesError, searchTextPage } from "./client";

const raw = {
  id: "ChIJ123",
  displayName: { text: " Gostilna Primer " },
  formattedAddress: "Glavni trg 1, 2000 Maribor, Slovenija",
  addressComponents: [
    { longText: "2000", types: ["postal_code"] },
    { longText: "Maribor", types: ["locality", "political"] },
  ],
  nationalPhoneNumber: "02 123 45 67",
  websiteUri: "http://www.gostilna-primer.si/",
  rating: 4.66,
  userRatingCount: 312,
  primaryTypeDisplayName: { text: "Restavracija" },
  googleMapsUri: "https://maps.google.com/?cid=1",
  businessStatus: "OPERATIONAL",
};

describe("mapPlace", () => {
  it("maps the fields we store", () => {
    expect(mapPlace(raw)).toEqual({
      placeId: "ChIJ123",
      name: "Gostilna Primer",
      address: "Glavni trg 1, 2000 Maribor, Slovenija",
      city: "Maribor",
      phone: "02 123 45 67",
      website: "http://www.gostilna-primer.si/",
      ratingX10: 47,
      reviewCount: 312,
      category: "Restavracija",
      mapsUrl: "https://maps.google.com/?cid=1",
    });
  });
  it("drops closed businesses and incomplete results", () => {
    expect(mapPlace({ ...raw, businessStatus: "CLOSED_PERMANENTLY" })).toBeNull();
    expect(mapPlace({ ...raw, id: undefined })).toBeNull();
    expect(mapPlace({ ...raw, displayName: { text: "  " } })).toBeNull();
  });
  it("tolerates missing optional fields", () => {
    const p = mapPlace({ id: "x", displayName: { text: "A" } })!;
    expect(p.city).toBeNull();
    expect(p.ratingX10).toBeNull();
    expect(p.website).toBeNull();
  });
});

describe("searchTextPage", () => {
  it("sends key, field mask and Slovenian region; maps the page", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ places: [raw, { id: "y" }], nextPageToken: "next1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const page = await searchTextPage({ query: "frizer Celje", pageToken: "p0" }, "KEY123", fake);
    expect(seen!.url).toBe(PLACES_ENDPOINT);
    const h = seen!.init.headers as Record<string, string>;
    expect(h["X-Goog-Api-Key"]).toBe("KEY123");
    expect(h["X-Goog-FieldMask"]).toBe(PLACES_FIELD_MASK);
    expect(JSON.parse(seen!.init.body as string)).toEqual({
      textQuery: "frizer Celje",
      languageCode: "sl",
      regionCode: "SI",
      pageSize: 20,
      pageToken: "p0",
    });
    expect(page.places.map((p) => p.placeId)).toEqual(["ChIJ123"]);
    expect(page.nextPageToken).toBe("next1");
  });

  it("throws only the status on errors, never the key or body", async () => {
    const fake = (async () => new Response('{"error":"API key KEY123 not valid"}', { status: 403 })) as unknown as typeof fetch;
    const e = await searchTextPage({ query: "x" }, "KEY123", fake).catch((x) => x);
    expect(e).toBeInstanceOf(PlacesError);
    expect(e.message).toBe("PLACES_ERROR_403");
    expect(String(e)).not.toContain("KEY123");
  });
});
