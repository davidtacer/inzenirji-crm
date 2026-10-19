import { describe, expect, it } from "vitest";
import { checkAiEmail, systemFor } from "./ai-email";
import { OPT_OUT_LINE } from "./compose";

const GOOD = `Pozdravljeni,

15 strank vam je na Googlu dalo povprečno 4,9 - to je za samostojno frizerko lepa vizitka. Ko vas nekdo išče na telefonu, pa najde samo zemljevid, brez vaših storitev in cen.

Sem David iz inženirji.si. Naredimo vam hitro spletno stran, ki se na telefonu odpre v trenutku in jo najdejo tudi Google in ChatGPT - za 590 € + DDV, na spletu v 7 dneh od prejema vseh materialov.

Potem jo urejate sami, kar preko klepeta: napišete, kaj želite spremeniti, ali pošljete sliko, AI pa to uredi v nekaj sekundah. Preizkusite tukaj: inzenirji.si/demo

Vas zanima? Na kratko mi odpišite, pa se za 15 minut slišiva po telefonu.

Lp,
David`;

const ctx = { group: "B" as const, rivals: ["Frizerski salon Dok"], companyName: "Frizerstvo Ana" };
const json = (body: string, subject = "Spletna stran za Frizerstvo Ana") => JSON.stringify({ subject, body });

describe("AI first e-mail checks (ADR-045)", () => {
  it("accepts a good text, fixes the demo link, cuts its signature, adds ours and the opt-out", () => {
    const r = checkAiEmail(json(GOOD), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.email.body).toContain("Preizkusite tukaj: https://www.inzenirji.si/demo");
    expect(r.email.body.endsWith(`Lp,\nDavid\ninženirji.si\n\n${OPT_OUT_LINE}`)).toBe(true);
    expect(r.email.body.match(/Lp,/g)).toHaveLength(1);
  });

  it("rejects: competitor, missing price, tikanje, foreign link, too long, long dash is fixed", () => {
    const bad = (body: string) => {
      const r = checkAiEmail(json(body), ctx);
      return r.ok ? [] : r.problems;
    };
    expect(bad(GOOD.replace("lepa vizitka.", "lepa vizitka. Frizerski salon Dok ima stran že dolgo."))).toContain("omenja Frizerski salon Dok");
    expect(bad(GOOD.replace("590 € + DDV", "ugodno ceno"))).toContain("manjka cena 590 € + DDV");
    expect(bad(GOOD.replace("Vas zanima?", "Te zanima? Imaš čas?"))).toContain("tikanje");
    expect(bad(GOOD.replace("Vas zanima?", "Poglejte https://primer.si. Vas zanima?"))).toContain("tuja povezava");
    expect(bad(GOOD.replace("Vas zanima?", `${"Še ena beseda. ".repeat(40)}Vas zanima?`)).some((p) => p.startsWith("dolžina"))).toBe(true);
    expect(bad(GOOD.replace("inzenirji.si/demo", "naši strani"))).toContain("manjka povezava na demo");
    expect(bad(GOOD.replace("hitro spletno stran", "hitro in čisto spletno stran"))).toContain("beseda »čist«");
    const dash = checkAiEmail(json(GOOD.replace(" - to je", " — to je")), ctx);
    expect(dash.ok && dash.email.body.includes("4,9 - to je")).toBe(true);
  });

  it("group A: no price allowed", () => {
    const a = GOOD.replace(" - za 590 € + DDV, na spletu v 7 dneh od prejema vseh materialov", "");
    expect(checkAiEmail(json(a), { ...ctx, group: "A" }).ok).toBe(true);
    const r = checkAiEmail(json(GOOD), { ...ctx, group: "A" });
    expect(r.ok ? [] : r.problems).toContain("cena pri prenosu");
  });

  it("prompt: offer per group, coffee only in Maribor, the owner's editor sentence", () => {
    expect(systemFor("B", "Celje")).toContain("590 € + DDV");
    expect(systemFor("A", "Celje")).toContain("Cene NE omenjaj");
    expect(systemFor("B", "Maribor")).toContain("kavo");
    expect(systemFor("B", "Celje")).not.toContain("kavo");
    expect(systemFor("B", null)).toContain("kar preko klepeta");
  });
});

describe("AI phrases (humanizer, owner 2026-10-19)", () => {
  it("rejects typical AI Slovenian and keeps a plain text", async () => {
    const { aiPhrases } = await import("../ai/humanize");
    expect(aiPhrases("V današnjem digitalnem svetu je spletna stran ključnega pomena.")).toEqual(expect.arrayContaining(["ključnega pomena", "v današnjem … svetu"]));
    expect(aiPhrases("Ne samo, da je hitra, ampak tudi lepa.")).toContain("ne samo … ampak tudi");
    expect(aiPhrases("Imate 4,9 na Googlu. Stran bi to lepo pokazala.")).toEqual([]);
    const r = checkAiEmail(json(GOOD.replace("lepa vizitka.", "lepa vizitka, ki je ključnega pomena.")), ctx);
    expect(r.ok ? [] : r.problems).toContain("AI fraza »ključnega pomena«");
    expect(systemFor("B", null)).toContain("ne kot AI");
  });
});
