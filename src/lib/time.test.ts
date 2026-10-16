import { describe, expect, it } from "vitest";
import { fromLocalInput, toLocalInput } from "./time";

describe("Ljubljana time", () => {
  it("summer (UTC+2) and winter (UTC+1) wall times", () => {
    expect(fromLocalInput("2026-10-20T14:30")?.toISOString()).toBe("2026-10-20T12:30:00.000Z");
    expect(fromLocalInput("2026-11-20T14:30")?.toISOString()).toBe("2026-11-20T13:30:00.000Z");
    expect(toLocalInput(new Date("2026-11-20T13:30:00Z"))).toBe("2026-11-20T14:30");
    expect(fromLocalInput("20.10.2026 14:30")).toBeNull();
  });
});
