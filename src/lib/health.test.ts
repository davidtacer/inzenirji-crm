import { describe, expect, it } from "vitest";
import { buildSha, checkHealth } from "./health";

describe("buildSha", () => {
  it("returns the deployed commit or unknown", () => {
    expect(buildSha({ GIT_SHA: "abc123" })).toBe("abc123");
    expect(buildSha({})).toBe("unknown");
    expect(buildSha({ GIT_SHA: "  " })).toBe("unknown");
  });
});

describe("checkHealth", () => {
  it("is ok when the database answers", async () => {
    const r = await checkHealth(async () => 1, { env: { GIT_SHA: "s1" } });
    expect(r).toEqual({ code: 200, body: { status: "ok", sha: "s1", db: "ok" } });
  });

  it("is 503 when the database fails, without details", async () => {
    const r = await checkHealth(async () => {
      throw new Error("password authentication failed for user crm");
    }, { env: {} });
    expect(r).toEqual({ code: 503, body: { status: "error", sha: "unknown", db: "error" } });
    expect(JSON.stringify(r)).not.toContain("password");
  });

  it("is 503 when the database hangs past the timeout", async () => {
    const r = await checkHealth(() => new Promise(() => {}), { timeoutMs: 20, env: {} });
    expect(r.code).toBe(503);
  });
});
