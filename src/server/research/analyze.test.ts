import { describe, expect, it } from "vitest";
import { analyzeHtml, findIssues, proposeGroup, summarize } from "./analyze";

const WP = `<!doctype html><html><head><title>Salon Ana &amp; Co</title>
<meta name="generator" content="WordPress 5.2.4">
<link rel="stylesheet" href="/wp-content/themes/x/style.css"></head>
<body><h1>Dobrodošli</h1><a href="mailto:info@salon-ana.si">Pišite</a> ali ANA@Salon-Ana.si
<img src="logo@2x.png"><a href="https://www.facebook.com/salonana/">FB</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">deli</a>
<a href="https://instagram.com/salon.ana">IG</a><a href="tel:+386 41 222 333">Pokliči</a>
<footer>&copy; 2016 Salon Ana</footer></body></html>`;

describe("analyzeHtml", () => {
  it("reads CMS, year, contacts and socials", () => {
    const f = analyzeHtml(WP);
    expect(f.cms).toBe("WordPress");
    expect(f.cmsVersion).toBe("5.2.4");
    expect(f.copyrightYear).toBe(2016);
    expect(f.hasViewport).toBe(false);
    expect(f.title).toBe("Salon Ana & Co");
    expect(f.h1Count).toBe(1);
    expect(f.emails).toEqual(["ana@salon-ana.si", "info@salon-ana.si"]);
    expect(f.socials).toEqual({ facebook: "https://www.facebook.com/salonana", instagram: "https://instagram.com/salon.ana" });
    expect(f.phones).toEqual(["041222333"]);
  });

  it("detects CMS by fingerprint and takes the later year of a range", () => {
    const f = analyzeHtml('<meta name="viewport" content="width=device-width"><img src="https://static.wixstatic.com/a.png"> © 2019–2025');
    expect(f.cms).toBe("Wix");
    expect(f.copyrightYear).toBe(2025);
    expect(f.hasViewport).toBe(true);
  });
});

describe("findIssues", () => {
  const f = analyzeHtml(WP);
  it("lists outreach-worthy problems for an old site", () => {
    const codes = findIssues(f, { kind: "own", https: false, ms: 4200, status: 200, googlePhoneDigits: "031555666", nowYear: 2026 }).map((i) => i.code);
    expect(codes).toEqual(["not_mobile", "old_year", "no_https", "slow", "cms", "phone_mismatch", "no_description", "no_structured_data"]);
  });
  it("matches the Google phone in +386 form", () => {
    const codes = findIssues(f, { kind: "own", https: true, status: 200, googlePhoneDigits: "38641222333", nowYear: 2026 }).map((i) => i.code);
    expect(codes).not.toContain("phone_mismatch");
  });
  it("short-circuits for missing, social, link-only and broken sites", () => {
    expect(findIssues(null, { kind: "none", nowYear: 2026 })[0].code).toBe("no_website");
    expect(findIssues(null, { kind: "social", nowYear: 2026 })[0].code).toBe("social_only");
    expect(findIssues(null, { kind: "link", nowYear: 2026 })[0].code).toBe("link_only");
    expect(findIssues(f, { kind: "own", status: 500, nowYear: 2026 })[0].code).toBe("unreachable");
  });
});

describe("group + summary", () => {
  it("A only for a reachable own site", () => {
    expect(proposeGroup("own", true)).toBe("A");
    expect(proposeGroup("own", false)).toBe("B");
    expect(proposeGroup("social", true)).toBe("B");
  });
  it("summary names the group and top issues", () => {
    expect(summarize([{ code: "no_website", severity: "high", text: "Podjetje nima spletne strani." }], "B")).toBe(
      "Skupina B — rabi novo spletno stran. Podjetje nima spletne strani.",
    );
  });
});
