import { describe, expect, it } from "vitest";
import { checklistFor } from "./checklist";

describe("manual checklist", () => {
  it("names both Pages projects and the editor URL of the site", () => {
    const text = JSON.stringify(checklistFor("vodniskuter-si", "vodniskuter.si"));
    expect(text).toContain("vodniskuter-si-dev");
    expect(text).toContain("https://uredi.inzenirji.si/?site=vodniskuter-si");
    expect(text).toContain("www.vodniskuter.si");
  });
  it("works for a client with no domain yet", () => {
    expect(JSON.stringify(checklistFor("abc", null))).toContain("vasa-stran.si");
  });
  it("keys are unique", () => {
    const keys = checklistFor("abc", null).map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
