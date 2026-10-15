import { describe, expect, it } from "vitest";
import { domainOf, normalizeEmail } from "./normalize";

describe("normalizeEmail", () => {
  it("lower-cases and trims", () => {
    expect(normalizeEmail("  Info@Gostilna-Primer.SI ")).toBe("info@gostilna-primer.si");
  });
  it("rejects non-addresses", () => {
    for (const bad of ["", "  ", "info", "info@", "@x.si", "a b@x.si", null, undefined]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
});

describe("domainOf", () => {
  it("handles URLs, bare hosts and e-mails", () => {
    expect(domainOf("https://www.Gostilna-Primer.si/meni?x=1")).toBe("gostilna-primer.si");
    expect(domainOf("gostilna-primer.si")).toBe("gostilna-primer.si");
    expect(domainOf("http://salon.primer.si:8080")).toBe("salon.primer.si");
    expect(domainOf("info@www.salon-primer.si")).toBe("salon-primer.si");
  });
  it("rejects unusable input", () => {
    for (const bad of ["", "localhost", "not a url", null]) expect(domainOf(bad)).toBeNull();
  });
});
