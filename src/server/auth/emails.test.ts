import { describe, expect, it } from "vitest";
import { isOwner, parseEmailList } from "./emails";

describe("parseEmailList", () => {
  it("splits on commas and spaces, lower-cases, de-duplicates, drops junk", () => {
    expect([...parseEmailList(" David@Inzenirji.si, dtacer@gmail.com david@inzenirji.si,,nope ")]).toEqual([
      "david@inzenirji.si",
      "dtacer@gmail.com",
    ]);
    expect(parseEmailList(undefined).size).toBe(0);
  });
});

describe("isOwner", () => {
  const owners = parseEmailList("david@inzenirji.si");
  it("matches case-insensitively and refuses others", () => {
    expect(isOwner("DAVID@inzenirji.si ", owners)).toBe(true);
    expect(isOwner("ana@inzenirji.si", owners)).toBe(false);
    expect(isOwner(null, owners)).toBe(false);
    expect(isOwner("david@inzenirji.si", new Set())).toBe(false);
  });
});
