import { describe, expect, it } from "vitest";
import { catalogueName, cataloguesFor, matchEntry, parseEntries, searchTerm } from "./ozs";

/** The answer of the catalogue search, as the owner copied it from the browser (2026-10-21). */
export const ANSWER = JSON.stringify({
  "#div_katalog-rezultat":
    '\n\n  <div class="katalog-clan">\n    <div class="flex-clan">\n      <div class="col katalog-slika">\n        \n      </div>\n      <div class="katalog-opis">\n         <div class="col katalog-naziv">ANASTASIJA DRUGE STORITVENE DEJAVNOSTI, ALEKSANDRA MARKOVIĆ S.P.</div>\n         CELJSKA CESTA 24B       ,  3212 VOJNIK<br><br>\n         Dejavnost: <em>Druge storitvene dejavnosti, drugje nerazvrščene</em><br><br>\n         Telefon: <strong>+386 (41) 500 628</strong><br>\n         e-Naslov: <a href="mailto:amsani33@gmail.com">amsani33@gmail.com</a><br>\n         \n      </div>\n    </div>\n  </div>\n  <div style="clear:both;"> </div>\n  <div class="katalog-clan">\n    <div class="flex-clan">\n      <div class="col katalog-slika">\n        \n      </div>\n      <div class="katalog-opis">\n         <div class="col katalog-naziv">FRIZERSKI SALON ALEKSANDRA, ALEKSANDRA STEGU s.p.</div>\n         GOSPOSKA ULICA 2         ,  3000 CELJE<br><br>\n         Dejavnost: <em>Frizerska dejavnost</em><br><br>\n         Telefon: <strong>+386 (3) 588 30 10,+386 (41) 372 307</strong><br>\n         e-Naslov: <a href="mailto:goran.stegu@siol.net">goran.stegu@siol.net</a><br>\n         \n      </div>\n    </div>\n  </div>\n  <div style="clear:both;"> </div>\n  <div class="katalog-clan">\n    <div class="flex-clan">\n      <div class="col katalog-slika">\n        \n      </div>\n      <div class="katalog-opis">\n         <div class="col katalog-naziv">ZASEBNA ZOBNA AMBULANTA ALEKSANDRA FABJAN, DR.DENT.MED.</div>\n         GREGORČIČEVA ULICA 5         ,  3000 CELJE<br><br>\n         Dejavnost: <em>Zobozdravstvena dejavnost</em><br><br>\n         Telefon: <strong>03 5434 353,+386 (31) 322 732</strong><br>\n         e-Naslov: <a href="mailto:fabjan.sandra@gmail.com">fabjan.sandra@gmail.com</a><br>\n         \n      </div>\n    </div>\n  </div>\n  <div style="clear:both;"> </div>\n\n\n\n',
});

const html = (JSON.parse(ANSWER) as Record<string, string>)["#div_katalog-rezultat"]!;

describe("OZS catalogue (owner 2026-10-21)", () => {
  it("reads the entries of a search answer", () => {
    const e = parseEntries(html);
    expect(e).toHaveLength(3);
    expect(e[1]).toEqual({
      name: "FRIZERSKI SALON ALEKSANDRA, ALEKSANDRA STEGU s.p.",
      address: "GOSPOSKA ULICA 2, 3000 CELJE",
      activity: "Frizerska dejavnost",
      phones: ["035883010", "041372307"],
      emails: ["goran.stegu@siol.net"],
    });
    expect(e[2]!.phones).toEqual(["035434353", "031322732"]);
  });

  it("uses an entry only when phone, street address or the whole name in the same town agree", () => {
    const [, stegu, fabjan] = parseEntries(html);
    const base = { name: "Frizerski salon Aleksandra", address: null, phone: null, city: "Celje" };
    expect(matchEntry(stegu!, { ...base, phone: "041 372 307" })).toBe("phone");
    expect(matchEntry(stegu!, { ...base, address: "Gosposka ulica 2, 3000 Celje, Slovenija" })).toBe("address");
    expect(matchEntry(stegu!, { ...base, name: "Frizerski salon Aleksandra Stegu" })).toBe("name");
    // Another salon called Aleksandra (Lever): the name alone is not enough.
    expect(matchEntry(stegu!, { ...base, name: "Frizerski Salon Aleksandra, Aleksandra Lever S.P." })).toBeNull();
    expect(matchEntry(fabjan!, { ...base, name: "Frizerski Salon Aleksandra, Aleksandra Lever S.P." })).toBeNull();
    expect(searchTerm("Frizerski Salon Aleksandra, Aleksandra Lever S.P.")).toBe("aleksandra");
  });

  it("finds the chamber of a town, or those of its region", () => {
    expect(catalogueName("<h1>Iskalnik po katalogu članov OOZ CELJE</h1><select><option>... izberite sekcijo ...</option></select>")).toBe("OOZ CELJE");
    expect(catalogueName("<h1>Iskalnik po katalogu članov OOZ SLOVENSKE KONJICE</h1>")).toBe("OOZ SLOVENSKE KONJICE");
    const map = { "OOZ CELJE": 13, "OOZ VELENJE": 40, "OOZ MARIBOR": 20, "OOZ LJUBLJANA CENTER": 30, "OOZ LJUBLJANA BEŽIGRAD": 31 };
    expect(cataloguesFor(map, "Celje")).toEqual([13]);
    expect(cataloguesFor(map, "Vojnik")).toEqual([13, 40]);
    expect(cataloguesFor(map, "Ljubljana")).toEqual([30, 31]);
    expect(cataloguesFor(map, null)).toEqual([]);
  });
});
