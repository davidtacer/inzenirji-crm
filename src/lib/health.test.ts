import { describe, expect, it } from "vitest";
import { healthBody } from "./health";

describe("healthBody", () => {
  it("reports ok and the deployed commit", () => {
    expect(healthBody({ GIT_SHA: "abc123" })).toEqual({ status: "ok", sha: "abc123" });
  });

  it("says unknown when the commit is not set", () => {
    expect(healthBody({})).toEqual({ status: "ok", sha: "unknown" });
    expect(healthBody({ GIT_SHA: "  " })).toEqual({ status: "ok", sha: "unknown" });
  });
});
