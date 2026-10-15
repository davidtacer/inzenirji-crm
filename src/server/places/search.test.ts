import { describe, expect, it } from "vitest";
import { validateSearch } from "./search";
import { isGoodBusiness } from "./import";

describe("validateSearch", () => {
  it("normalises spaces and accepts 1–3 pages", () => {
    expect(validateSearch({ query: "  frizer   Celje ", pages: "2" })).toEqual({ query: "frizer Celje", pages: 2 });
  });
  it("rejects too short/long queries and bad page counts", () => {
    expect(validateSearch({ query: "ab", pages: 1 })).toBeNull();
    expect(validateSearch({ query: "x".repeat(101), pages: 1 })).toBeNull();
    expect(validateSearch({ query: "frizer", pages: 4 })).toBeNull();
    expect(validateSearch({ query: "frizer", pages: 0 })).toBeNull();
    expect(validateSearch({ query: "frizer", pages: "1.5" })).toBeNull();
  });
});

describe("isGoodBusiness", () => {
  it("needs rating ≥ 4.3 and ≥ 30 reviews", () => {
    expect(isGoodBusiness({ ratingX10: 43, reviewCount: 30 })).toBe(true);
    expect(isGoodBusiness({ ratingX10: 42, reviewCount: 500 })).toBe(false);
    expect(isGoodBusiness({ ratingX10: 49, reviewCount: 29 })).toBe(false);
    expect(isGoodBusiness({ ratingX10: null, reviewCount: null })).toBe(false);
  });
});
