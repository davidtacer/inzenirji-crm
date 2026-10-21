import { describe, expect, it } from "vitest";
import { parseCompanyEdit, type CompanyEdit } from "./edit";

const base: CompanyEdit = { name: "Dego", phone: "", address: "", city: "", website: "", category: "" };

describe("parseCompanyEdit", () => {
  it("trims, keeps the name and turns empty optional fields into null", () => {
    expect(parseCompanyEdit({ ...base, name: "  Dejan   Golob  " })).toEqual({
      ok: true,
      values: { name: "Dejan Golob", phone: null, address: null, city: null, website: null, websiteDomain: null, category: null },
    });
  });

  it("adds https:// to the website and derives the domain", () => {
    const r = parseCompanyEdit({ ...base, website: "www.Lotus4u.si", phone: "+386 70 812 542", city: " Maribor " });
    expect(r).toMatchObject({ ok: true, values: { website: "https://www.Lotus4u.si", websiteDomain: "lotus4u.si", phone: "+386 70 812 542", city: "Maribor" } });
  });

  it("refuses a missing name, a bad phone and a bad website with a Slovenian message", () => {
    expect(parseCompanyEdit({ ...base, name: " a " })).toEqual({ ok: false, message: "Vpiši ime podjetja (vsaj 2 znaka)." });
    expect(parseCompanyEdit({ ...base, phone: "pokliči me" })).toMatchObject({ ok: false });
    expect(parseCompanyEdit({ ...base, website: "nekaj brez pike" })).toMatchObject({ ok: false, message: "Spletna stran ni veljaven naslov." });
    expect(parseCompanyEdit({ ...base, name: "x".repeat(201) })).toMatchObject({ ok: false });
  });
});
