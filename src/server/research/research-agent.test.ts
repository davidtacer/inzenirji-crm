import { describe, expect, it } from "vitest";
import { AiError } from "../ai/anthropic";
import { siteState } from "./analyze";
import { domainCarriesName, isBuilderSite, parseResearch, searchError } from "./websearch";

describe("AI researcher helpers (TASK-034)", () => {
  it("recognises »v izdelavi«, parked and real sites", () => {
    expect(siteState("<h1>Stran je v izdelavi</h1>")).toBe("under_construction");
    expect(siteState("<h1>Coming soon</h1><p>We are launching soon.</p>")).toBe("under_construction");
    expect(siteState("<p>This domain is parked free, courtesy of the registrar.</p>")).toBe("parked");
    expect(siteState(`<h1>Salon</h1><p>${"Naše storitve so v pripravi za novo sezono. ".repeat(60)}</p>`)).toBe("live");
  });

  it("domain carries the company name; builder sites", () => {
    expect(domainCarriesName("salonfantazija.si", "Frizerski salon FANTAZIJA")).toBe(true);
    expect(domainCarriesName("drug-salon.si", "Frizerski salon FANTAZIJA")).toBe(false);
    expect(isBuilderSite("https://mikulickaja.wixsite.com/salon-fantazijaa")).toBe(true);
    expect(isBuilderSite("https://www.salonfantazija.si")).toBe(false);
  });

  it("parses the answer around prose and code fences; bare domains become https", () => {
    const p = parseResearch('Našel sem:\n```json\n{"website":"www.salon.si","profiles":[{"kind":"instagram","url":"instagram.com/salon","followers":"2.888"}],"facts":["x"]}\n```')!;
    expect(p.website).toBe("https://www.salon.si");
    expect(p.profiles[0]).toMatchObject({ url: "https://instagram.com/salon", followers: 2888 });
    expect(parseResearch("ni podatkov")).toBeNull();
  });

  it("explains failures in words", () => {
    expect(searchError(new AiError(400, "invalid_request_error: Web search is not enabled for your organization"))).toMatch(/Anthropic Console/);
    expect(searchError(new AiError(401))).toMatch(/ANTHROPIC_API_KEY/);
    expect(searchError(Object.assign(new Error("x"), { name: "AbortError" }))).toMatch(/predolgo/);
  });
});

describe("web search request", () => {
  it("sends no user_location (the API rejects country SI)", async () => {
    const { callClaudeWithSearch } = await import("../ai/anthropic");
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: {} }), { status: 200 });
    }) as unknown as typeof fetch;
    await callClaudeWithSearch({ model: "claude-sonnet-5-5", system: "s", user: "u", maxTokens: 10, maxSearches: 2, country: "SI", city: "Celje" }, { apiKey: "k", fetchImpl });
    const tool = (body.tools as Record<string, unknown>[])[0]!;
    expect(tool).toMatchObject({ type: "web_search_20250305", max_uses: 2 });
    expect(tool).not.toHaveProperty("user_location");
  });
});
