import { describe, expect, it } from "vitest";
import { composeFirst, composeFollowUp1, composeFollowUp2, OPT_OUT_LINE, remarkFor, toHtml, type ComposeInput } from "./compose";
import { unsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe";

const base: ComposeInput = {
  name: "Salon Ana",
  city: "Celje",
  group: "A",
  websiteDomain: "salon-ana.si",
  ratingX10: 48,
  reviewCount: 80,
  issues: [
    { code: "old_year", severity: "medium", text: "V nogi strani piše letnica 2015." },
    { code: "cms", severity: "low", text: "Stran teče na sistemu WordPress 4.9." },
  ],
};

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe("composeFirst", () => {
  it("group A: personal remark, editor link, no price, opt-out, short", () => {
    const m = composeFirst(base);
    expect(m.subject).toBe("Spletna stran za Salon Ana");
    expect(m.body).toContain("opazil sem, da je v nogi vaše spletne strani še letnica 2015, stran pa teče na WordPress 4.9 - škoda, ker imate na Googlu odlične ocene (4,8 iz 80 mnenj).");
    expect(m.body).toContain("inzenirji.si/urejevalnik");
    expect(m.body).not.toMatch(/€/); // ADR-009: never a migration price
    expect(m.body).not.toMatch(/—/); // style: plain hyphens
    expect(m.body).not.toMatch(/priponk|mockup|predlog v/i); // ADR-005
    expect(m.body).toContain("15 min slišimo po telefonu");
    expect(m.body.endsWith(OPT_OUT_LINE)).toBe(true);
    expect(words(m.body)).toBeLessThan(150);
  });

  it("group B in Maribor with a social profile only: offer, rival, coffee", () => {
    const m = composeFirst({
      ...base,
      city: "Maribor",
      group: "B",
      websiteDomain: "facebook.com",
      issues: [{ code: "social_only", severity: "high", text: "x" }],
      rival: { name: "Frizer Beta", distanceM: 430 },
    });
    expect(m.body).toContain("se predstavljate samo na Facebooku, lastne spletne strani pa nimate");
    expect(m.body).toContain("Frizer Beta, 450 m od vas, ima svojo spletno stran");
    expect(m.body).toContain("590 € + DDV");
    expect(m.body).toContain("na kavo");
    expect(m.body).not.toContain("urejevalnik");
  });

  it("rival line only when the lead itself is weak online", () => {
    expect(composeFirst({ ...base, rival: { name: "X", distanceM: 100 } }).body).not.toContain("X,");
  });

  it("no issues and no great reviews still makes a sentence", () => {
    expect(remarkFor({ ...base, issues: [], ratingX10: 40 })).toBe("bi vaša spletna stran lahko delala bolje za vas");
  });
});

describe("follow-ups", () => {
  it("day 3 adds the second issue, day 8 closes; both reply to the first subject and keep opt-out", () => {
    const f1 = composeFollowUp1(base, "Spletna stran za Salon Ana");
    expect(f1.subject).toBe("Re: Spletna stran za Salon Ana");
    expect(f1.body).toContain("opazil še, da vaša spletna stran teče na WordPress 4.9.");
    const f2 = composeFollowUp2(base, "Spletna stran za Salon Ana");
    expect(f2.body).toContain("zadnje sporočilo");
    for (const b of [f1.body, f2.body]) expect(b.endsWith(OPT_OUT_LINE)).toBe(true);
  });
});

describe("toHtml", () => {
  it("escapes, links our site with friendly text, keeps paragraphs", () => {
    const h = toHtml("A <b>\n\nSem iz inženirji.si (https://www.inzenirji.si)\n\nTukaj: https://www.inzenirji.si/urejevalnik");
    expect(h).toContain("A &lt;b&gt;");
    expect(h).toContain('<a href="https://www.inzenirji.si">inženirji.si</a>');
    expect(h).toContain('<a href="https://www.inzenirji.si/urejevalnik">inzenirji.si/urejevalnik</a>');
    expect(h).not.toContain("(https://");
  });
});

describe("unsubscribe token", () => {
  it("round-trips and rejects tampering or another secret", () => {
    const t = unsubscribeToken("info@salon-ana.si", "s3cret");
    expect(verifyUnsubscribeToken(t, "s3cret")).toBe("info@salon-ana.si");
    expect(verifyUnsubscribeToken(t, "other")).toBeNull();
    const [, sig] = t.split(".");
    expect(verifyUnsubscribeToken(`${Buffer.from("x@y.si").toString("base64url")}.${sig}`, "s3cret")).toBeNull();
    expect(verifyUnsubscribeToken("garbage", "s3cret")).toBeNull();
  });
});
