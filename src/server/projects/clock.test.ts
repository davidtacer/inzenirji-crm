import { describe, expect, it } from "vitest";
import { clock } from "./projects";
import { checkUpload } from "./storage";

const D = (s: string) => new Date(s);
const base = { confirmedAt: D("2026-10-20T10:00:00Z"), timelineDays: 7, launchedAt: null };

describe("guarantee clock", () => {
  it("does not run before confirmation", () => {
    expect(clock({ ...base, confirmedAt: null }, [])).toMatchObject({ started: false, deadline: null });
  });
  it("deadline = start + 7 days + paused time; open pause keeps counting and marks paused", () => {
    expect(clock(base, [], D("2026-10-22T10:00:00Z"))).toMatchObject({ deadline: D("2026-10-27T10:00:00Z"), daysLeft: 5, paused: false });
    const pauses = [{ startAt: D("2026-10-21T10:00:00Z"), endAt: D("2026-10-23T10:00:00Z") }];
    expect(clock(base, pauses, D("2026-10-24T10:00:00Z")).deadline).toEqual(D("2026-10-29T10:00:00Z"));
    const open = [{ startAt: D("2026-10-24T10:00:00Z"), endAt: null }];
    expect(clock(base, open, D("2026-10-25T10:00:00Z"))).toMatchObject({ paused: true, deadline: D("2026-10-28T10:00:00Z") });
  });
  it("pauses before the start do not count; launch freezes days left", () => {
    expect(clock(base, [{ startAt: D("2026-10-19T10:00:00Z"), endAt: D("2026-10-20T09:00:00Z") }], D("2026-10-20T10:00:00Z")).pausedMs).toBe(0);
    expect(clock({ ...base, launchedAt: D("2026-10-25T10:00:00Z") }, [], D("2026-11-30T10:00:00Z")).daysLeft).toBe(2);
  });
});

describe("uploads", () => {
  it("accepts images/PDF up to 20 MB, refuses other types and empty files", () => {
    expect(checkUpload({ name: "logo.png", type: "image/png", size: 1000 })).toBeNull();
    expect(checkUpload({ name: "x.exe", type: "application/x-msdownload", size: 1000 })).toMatch(/ni podprta/);
    expect(checkUpload({ name: "big.jpg", type: "image/jpeg", size: 21 * 1024 * 1024 })).toMatch(/20 MB/);
    expect(checkUpload({ name: "e.png", type: "image/png", size: 0 })).toMatch(/prazna/);
  });
});
