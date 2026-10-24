import { describe, expect, it } from "vitest";
import { checklistFor } from "./checklist";
import { devUrl } from "./siteId";

describe("manual checklist", () => {
  it("names both Pages projects, the dev subdomain and the editor URL of the site", () => {
    const text = JSON.stringify(checklistFor("vodniskuter-si", "vodniskuter.si"));
    expect(text).toContain("vodniskuter-si-dev");
    expect(text).toContain("dev.vodniskuter.si");
    expect(text).toContain("https://uredi.inzenirji.si/?site=vodniskuter-si");
    expect(text).toContain("www.vodniskuter.si");
  });
  it("never tells the owner to send a pages.dev link to the client", () => {
    const text = JSON.stringify(checklistFor("vodniskuter-si", "vodniskuter.si"));
    expect(text).toContain("nikoli ne pošlji naslova *.pages.dev");
    expect(text).not.toMatch(/Pričakuješ: [^"]*\.pages\.dev kaže/);
  });
  it("works for a client with no domain yet", () => {
    expect(JSON.stringify(checklistFor("abc", null))).toContain("vasa-stran.si");
  });
  it("keys are unique", () => {
    const keys = checklistFor("abc", null).map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("dev preview URL", () => {
  it("is a subdomain of the client domain, pages.dev only as a placeholder", () => {
    expect(devUrl("vodniskuter-si", "vodniskuter.si")).toBe("https://dev.vodniskuter.si");
    expect(devUrl("abc", null)).toBe("https://abc-dev.pages.dev");
  });
});
