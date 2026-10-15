import { describe, expect, it } from "vitest";
import { websiteKind } from "./website";

describe("websiteKind", () => {
  it("tells own sites from social profiles and link pages", () => {
    expect(websiteKind("dachic.si")).toBe("own");
    expect(websiteKind("facebook.com")).toBe("social");
    expect(websiteKind("m.facebook.com")).toBe("social");
    expect(websiteKind("linktr.ee")).toBe("link");
    expect(websiteKind("onelink.to")).toBe("link");
    expect(websiteKind(null)).toBe("none");
  });
  it("does not match look-alike own domains", () => {
    expect(websiteKind("notfacebook.com")).toBe("own");
    expect(websiteKind("facebook.com.si")).toBe("own");
  });
});
