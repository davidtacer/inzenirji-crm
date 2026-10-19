import { describe, expect, it } from "vitest";
import { findConstraint, ruleSuggestions, type WeekData } from "./weekly";

const week = (o: Partial<WeekData> & { first?: number; replies?: number }): WeekData => ({
  weekStart: "2026-10-12",
  from: "",
  to: "",
  partial: false,
  leads: o.leads ?? 40,
  researched: 30,
  outreach: { first: o.first ?? 30, followups: 0, replies: o.replies ?? 3, interested: 2, no: 0, bounces: 0, optOuts: 0 },
  calls: o.calls ?? 7,
  proposals: o.proposals ?? { sent: 4, accepted: 2, acceptedNetCents: 118000 },
  paid: { count: 0, cents: 0 },
  launched: { count: 0, onTime: 0 },
  monthSales: 2,
  monthLabel: "oktober",
  replyHoursMedian: 0.5,
  ai: { microUsd: 0, byJob: {} },
  placesCalls: 0,
  demo: { stats: null, days: 7, leads: 0, error: null },
  channels: [],
  worked: { categories: [], groups: [] },
});

describe("constraint (Theory of Constraints, owner 2026-10-19)", () => {
  it("David's real week: 85 leads, 4 e-mails → the e-mails are the bottleneck, all 3 proposals aim there", () => {
    const d = week({ leads: 85, first: 4, replies: 0, calls: 0, proposals: { sent: 0, accepted: 0, acceptedNetCents: 0 } });
    expect(findConstraint(d)).toMatchObject({ key: "emails", actual: "4", target: "30 na teden" });
    const s = ruleSuggestions(d);
    expect(s).toHaveLength(3);
    expect(s[0]).toMatch(/6 prvih e-mailov.*Ta teden jih je šlo 4/);
  });

  it("a running week is measured against the days so far", () => {
    const monday = { ...week({ leads: 5, first: 5 }), partial: true, demo: { stats: null, days: 1, leads: 0, error: null } };
    expect(findConstraint(monday)).toBeNull();
    const wed = { ...week({ leads: 5, first: 20 }), partial: true, demo: { stats: null, days: 3, leads: 0, error: null } };
    expect(findConstraint(wed)).toMatchObject({ key: "leads", target: "13 do zdaj (30 na teden)" });
  });

  it("the first weak step wins; steps without enough data are skipped", () => {
    expect(findConstraint(week({ leads: 10 }))?.key).toBe("leads");
    expect(findConstraint(week({ first: 40, replies: 1 }))?.key).toBe("replies");
    expect(findConstraint(week({ first: 40, replies: 10, calls: 1 }))?.key).toBe("calls");
    expect(findConstraint(week({ first: 40, replies: 10, calls: 4, proposals: { sent: 4, accepted: 0, acceptedNetCents: 0 } }))?.key).toBe("sales");
    expect(findConstraint(week({}))).toBeNull();
  });
});
