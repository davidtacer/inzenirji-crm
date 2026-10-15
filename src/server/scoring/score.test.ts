import { describe, expect, it } from "vitest";
import { scoreLead, type ScoreInput } from "./score";

const base: ScoreInput = {
  ratingX10: 48,
  reviewCount: 120,
  kind: "none",
  reachable: false,
  issues: [],
  competitorKinds: ["own", "own", "own"],
  hasEmail: true,
  hasPhone: true,
  doNotContact: false,
};

describe("scoreLead", () => {
  it("a strong business without a site, neighbours with sites, reachable → near the top", () => {
    const s = scoreLead(base);
    expect(s.parts.map((p) => [p.key, p.points])).toEqual([
      ["business", 16 + 11],
      ["opportunity", 35],
      ["gap", 15],
      ["reach", 15],
    ]);
    expect(s.total).toBe(92);
  });

  it("a good own site with only small issues scores low on opportunity and gap", () => {
    const s = scoreLead({ ...base, kind: "own", reachable: true, issues: [{ code: "no_h1", severity: "low", text: "" }] });
    expect(s.parts.find((p) => p.key === "opportunity")!.points).toBe(2);
    expect(s.parts.find((p) => p.key === "gap")!.points).toBe(0);
  });

  it("an old own site adds up issue weights, capped at 35", () => {
    const issues = Array.from({ length: 5 }, () => ({ code: "x", severity: "high" as const, text: "" }));
    expect(scoreLead({ ...base, kind: "own", reachable: true, issues }).parts[1].points).toBe(35);
  });

  it("weak businesses and unreachable people score low; do-not-contact is always 0", () => {
    const weak = scoreLead({ ...base, ratingX10: 39, reviewCount: 5, hasEmail: false, hasPhone: false });
    expect(weak.parts[0].points).toBe(0);
    expect(weak.parts[3].points).toBe(0);
    expect(scoreLead({ ...base, doNotContact: true }).total).toBe(0);
  });

  it("stays within 0–100 for extreme inputs", () => {
    const s = scoreLead({ ...base, ratingX10: 50, reviewCount: 100000 });
    expect(s.total).toBeLessThanOrEqual(100);
    expect(s.parts[0].points).toBe(35);
  });
});
