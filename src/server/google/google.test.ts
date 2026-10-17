import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";
import { authUrl, checkState, makeState } from "./oauth";

describe("google helpers", () => {
  it("encrypts tokens so only the same secret can read them", () => {
    const enc = encrypt("1//refresh-token", "s1");
    expect(enc).not.toContain("refresh");
    expect(decrypt(enc, "s1")).toBe("1//refresh-token");
    expect(() => decrypt(enc, "s2")).toThrow();
  });
  it("state is signed and expires after 10 minutes", () => {
    const st = makeState("s", 1_000_000);
    expect(checkState(st, "s", 1_000_000 + 60_000)).toBe(true);
    expect(checkState(st, "other", 1_000_000)).toBe(false);
    expect(checkState(st, "s", 1_000_000 + 11 * 60_000)).toBe(false);
  });
  it("auth URL asks read-only calendar with offline access", () => {
    const u = new URL(authUrl({ clientId: "cid", clientSecret: "x", redirectUri: "https://crm.inzenirji.si/api/google/callback", secret: "s" }, "st"));
    expect(u.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/webmasters.readonly");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("redirect_uri")).toBe("https://crm.inzenirji.si/api/google/callback");
  });
});
