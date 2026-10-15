import { describe, expect, it } from "vitest";
import { callClaude, costMicroUsd } from "./anthropic";
import { buildPrompt, cleanRemark } from "./remark";

describe("cleanRemark", () => {
  it("accepts JSON, tidies dashes, case, repeated lead-in and full stop", () => {
    expect(cleanRemark('Tukaj: {"remark": "Opazil sem, da Na strani piše sobota do 12h — na Googlu do 13h.", "basis": "delovni čas"}')).toEqual({
      remark: "na strani piše sobota do 12h - na Googlu do 13h",
      basis: "delovni čas",
    });
  });
  it("rejects missing JSON, too short, prices or AI mentions", () => {
    expect(cleanRemark("ni json")).toBeNull();
    expect(cleanRemark('{"remark": "slaba stran"}')).toBeNull();
    expect(cleanRemark('{"remark": "vaša stran je stara, nova stane samo 590 €"}')).toBeNull();
    expect(cleanRemark('{"remark": "naša umetna inteligenca je opazila, da je stran stara"}')).toBeNull();
  });
});

describe("buildPrompt", () => {
  it("contains only stored facts, capped site text, reviews without empty ones", () => {
    const p = buildPrompt(
      { name: "Salon Ana", category: "Frizer", city: "Celje", websiteDomain: null, ratingX10: 48, reviewCount: 90 },
      [{ code: "social_only", severity: "high", text: "Ima samo Facebook." }],
      { siteText: "x".repeat(10000), google: { summary: "Prijazen salon.", reviews: [{ rating: 5, text: "Super barvanje!" }, { rating: 4, text: "" }] } },
    );
    expect(p).toContain("Spletna stran: nima");
    expect(p).toContain("Google ocena: 4,8 (90 mnenj)");
    expect(p).toContain("- Ima samo Facebook.");
    expect(p).toContain("(5★) Super barvanje!");
    expect(p).not.toContain("(4★)");
    expect(p.length).toBeLessThan(4200);
  });
});

describe("anthropic client", () => {
  it("sends key in header, model and limits; returns text, tokens and cost", async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ content: [{ type: "text", text: "{}" }], usage: { input_tokens: 3000, output_tokens: 100 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await callClaude({ model: "claude-sonnet-5-5", system: "s", user: "u", maxTokens: 300 }, { apiKey: "KEY", fetchImpl: fake });
    expect(r).toEqual({ text: "{}", inputTokens: 3000, outputTokens: 100, costMicroUsd: 7000 });
    const headers = sent!.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("KEY");
    expect(JSON.parse(String(sent!.init.body))).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 300, system: "s" });
    expect(costMicroUsd("claude-haiku-5-5", 1_000_000, 0)).toBe(100_000);
  });
  it("errors carry only the status", async () => {
    const fake = (async () => new Response("secret body", { status: 401 })) as unknown as typeof fetch;
    await expect(callClaude({ model: "m", system: "s", user: "u", maxTokens: 1 }, { apiKey: "K", fetchImpl: fake })).rejects.toThrow(/^AI_HTTP_401$/);
  });
});
