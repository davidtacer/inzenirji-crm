import { describe, expect, it } from "vitest";
import { deriveSiteId, validSiteId } from "./siteId";

describe("site id", () => {
  it("derives from a domain or URL", () => {
    expect(deriveSiteId("vodniskuter.si")).toBe("vodniskuter-si");
    expect(deriveSiteId("https://www.Grant-SI.si/kontakt?x=1")).toBe("grant-si-si");
  });
  it("folds Slovenian letters", () => {
    expect(deriveSiteId("Gostilna Šeruga Žalec")).toBe("gostilna-seruga-zalec");
  });
  it("returns empty when nothing usable is left", () => {
    expect(deriveSiteId("  ---  ")).toBe("");
    expect(deriveSiteId("")).toBe("");
  });
  it("validates format and length boundaries", () => {
    expect(validSiteId("ab")).toBe(false);
    expect(validSiteId("abc")).toBe(true);
    expect(validSiteId("a".repeat(50))).toBe(true);
    expect(validSiteId("a".repeat(51))).toBe(false);
    expect(validSiteId("-abc")).toBe(false);
    expect(validSiteId("a--b")).toBe(false);
    expect(validSiteId("Abc")).toBe(false);
    expect(validSiteId("a_b")).toBe(false);
  });
});
