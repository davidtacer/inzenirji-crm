import { describe, expect, it } from "vitest";
import { emailsNearCompany, pageMatches } from "./websearch";
import { websiteKind } from "../contact/website";

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

describe("listing pages (owner 2026-10-21: OZS catalogue)", () => {
  const html = `<div><b>FRIZER MATIA MIRAGE MATIJA ČRETNIK s.p.</b><br>SLOMŠKOV TRG 4 , 3000 CELJE<br><br>Dejavnost: Frizerska dejavnost<br><br>Telefon: <b>+386 (3) 544 33 92</b><br>e-Naslov: <a href="mailto:matiamirage@gmail.com">matiamirage@gmail.com</a></div>
<div><b>FRIZERSKI SALON ALEKSANDRA, ALEKSANDRA STEGU s.p.</b><br>GOSPOSKA ULICA 2 , 3000 CELJE<br><br>Dejavnost: Frizerska dejavnost<br><br>Telefon: <b>+386 (3) 588 30 10,+386 (41) 372 307</b><br>e-Naslov: <a href="mailto:goran.stegu@siol.net">goran.stegu@siol.net</a></div>
<div><b>FRIZERSTVO HELENA ČATORIČ S.P.</b><br>ŠTEKLIČEVA ULICA 3 , 3000 CELJE<br><br>Dejavnost: Frizerska dejavnost<br><br>Telefon: <b>+386 (40) 147 514</b><br>e-Naslov: <a href="mailto:helena.catoric@gmail.com">helena.catoric@gmail.com</a></div>`;
  const co = (over: Partial<Parameters<typeof emailsNearCompany>[1]>) => ({ name: "", category: null, address: null, city: "Celje", phone: null, website: null, country: "SI", ...over });
  it("takes only the company's own entry", () => {
    expect(emailsNearCompany(html, co({ name: "Frizerstvo Helena Čatorič", phone: "040 147 514" }))).toEqual(["helena.catoric@gmail.com"]);
    expect(emailsNearCompany(html, co({ name: "Frizerski salon Aleksandra, Aleksandra Stegu s.p." }))).toEqual(["goran.stegu@siol.net"]);
    // Another salon called Aleksandra (Lever) is not on this page: nothing.
    expect(emailsNearCompany(html, co({ name: "Frizerski Salon Aleksandra, Aleksandra Lever S.P.", address: "Mariborska 10, 3000 Celje" }))).toEqual([]);
  });
  it("a directory is never a company's website", () => {
    expect(websiteKind("www1.ozs.si")).toBe("none");
    expect(websiteKind("bizi.si")).toBe("none");
    expect(websiteKind("salonfantazija.si")).toBe("own");
  });
});
