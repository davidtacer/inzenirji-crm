import { describe, expect, it } from "vitest";
import { parseItems, totals } from "./proposals";
import { decode } from "upnqr";
import { toLatin2, upnText } from "./upn";
import { validIban } from "../settings";

describe("proposal money", () => {
  it("totals with and without VAT, deposit", () => {
    expect(totals([{ label: "Stran", priceCents: 59_000 }], 2200, true, 50)).toEqual({ net: 59_000, vat: 12_980, gross: 71_980, deposit: 35_990 });
    expect(totals([{ label: "Stran", priceCents: 59_000 }], 2200, false, 50)).toEqual({ net: 59_000, vat: 0, gross: 59_000, deposit: 29_500 });
  });
  it("parses item lines with Slovenian number formats", () => {
    expect(parseItems("Nova stran | 590\nAngleščina | 1.200,50 €\n\n")).toEqual([
      { label: "Nova stran", priceCents: 59_000 },
      { label: "Angleščina", priceCents: 120_050 },
    ]);
    expect(parseItems("Brez cene")).toMatch(/vpiši ceno/);
    expect(parseItems("")).toBe("Dodaj vsaj eno postavko.");
  });
});

describe("UPN QR", () => {
  const input = { amountCents: 35_990, purpose: "Predplačilo 50% - Salon Ana", dueDate: new Date("2026-10-30T12:00:00Z"), iban: "SI56 2633 0001 2039 086", reference: "SI00 57308522", name: "David Tacer s.p.", street: "Ulica 1", city: "2000 Maribor" };
  it("upnqr string decodes back with our values; reference without spaces; valid checksum", () => {
    const t = upnText(input);
    const lines = t.split("\n");
    expect(lines[0]).toBe("UPNQR");
    expect(lines[8]).toBe("00000035990");
    expect(lines[15]).toBe("SI0057308522");
    const back = decode(t);
    expect(back).toMatchObject({ znesek: 359.9, koda_namena: "OTHR", namen_placila: "Predplačilo 50% - Salon Ana", IBAN_prejemnika: "SI56263300012039086", referenca_prejemnika: "SI0057308522", ime_prejemnika: "David Tacer s.p.", kraj_prejemnika: "2000 Maribor" });
    expect(back.rok_placila?.getDate()).toBe(30);
    expect([...toLatin2("čšž")]).toEqual([0xe8, 0xb9, 0xbe]);
  });
  it("IBAN check", () => {
    expect(validIban("SI56263300012039086")).toBe(true);
    expect(validIban("SI56263300012039087")).toBe(false);
  });
});
