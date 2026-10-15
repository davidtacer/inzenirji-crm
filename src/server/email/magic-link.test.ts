import { describe, expect, it } from "vitest";
import { magicLinkMail } from "./magic-link";

describe("magicLinkMail", () => {
  it("contains the link in text and escaped in html", () => {
    const url = 'https://crm.inzenirji.si/api/auth/magic-link/verify?token=a&b="x"';
    const m = magicLinkMail("david@inzenirji.si", url);
    expect(m.to).toBe("david@inzenirji.si");
    expect(m.text).toContain(url);
    expect(m.html).toContain("token=a&amp;b=&quot;x&quot;");
    expect(m.html).not.toContain('"x"');
  });
});
