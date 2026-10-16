import { describe, expect, it } from "vitest";
import { pageMatches } from "./websearch";

const c = { name: "Frizerski salon FANTAZIJA", category: "Frizer", address: "Miklošičeva ulica 5, 3000 Celje, Slovenija", city: "Celje", phone: "031 241 241", website: null, country: "SI" };

describe("pageMatches", () => {
  it("phone, address or distinctive name + city", () => {
    expect(pageMatches("<p>Pokličite +386 31 241 241</p>", c)).toBe(true);
    expect(pageMatches("<p>Miklošičeva 5, 3000 Celje</p>", c)).toBe(true);
    expect(pageMatches("<h1>Salon Fantazija</h1><p>Celje</p>", c)).toBe(true);
    expect(pageMatches("<h1>Salon Fantazija</h1><p>Ljubljana, 041 999 888</p>", c)).toBe(false);
    expect(pageMatches("<h1>Frizerski salon</h1><p>Celje</p>", c)).toBe(false);
  });
});
