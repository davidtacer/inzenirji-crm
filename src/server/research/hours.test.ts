import { describe, expect, it } from "vitest";
import { googleHours, hoursMismatch, parseSiteHours } from "./hours";

const g = (spec: Record<number, [number, number] | null>) =>
  Object.entries(spec).flatMap(([day, v]) => (v ? [{ open: { day: Number(day), hour: v[0], minute: 0 }, close: { day: Number(day), hour: v[1], minute: 0 } }] : []));

describe("parseSiteHours", () => {
  it("reads ranges, single days, dots and h, closed days", () => {
    const h = parseSiteHours("Delovni čas:\nPon - Pet: 8:00 - 16:00\nSobota 8.00–12.00\nNed: zaprto");
    expect(h).toEqual({ 1: { open: 480, close: 960 }, 2: { open: 480, close: 960 }, 3: { open: 480, close: 960 }, 4: { open: 480, close: 960 }, 5: { open: 480, close: 960 }, 6: { open: 480, close: 720 }, 7: null });
    expect(parseSiteHours("ponedeljek–petek od 7h do 15h")?.[3]).toEqual({ open: 420, close: 900 });
  });
  it("ignores words that only contain day letters, and gives up on conflicting hours", () => {
    expect(parseSiteHours("Petrol, sobna temperatura, tortica 12 - 14")).toBeNull();
    expect(parseSiteHours("Celje: sob 8-12. Maribor: sob 9-13.")).toBeNull();
  });
});

describe("googleHours + hoursMismatch", () => {
  const google = googleHours(g({ 1: [8, 16], 2: [8, 16], 3: [8, 16], 4: [8, 16], 5: [8, 16], 6: [8, 13], 0: null }));
  it("Saturday close differs → the classic sentence", () => {
    expect(hoursMismatch(parseSiteHours("pon-pet 8-16, sob 8-12, ned zaprto"), google)).toBe("Na strani piše, da ste ob sobotah odprti do 12h, na Googlu pa do 13h.");
  });
  it("same hours → null; closed vs open → sentence", () => {
    expect(hoursMismatch(parseSiteHours("pon-pet 8-16, sob 8-13, ned zaprto"), google)).toBeNull();
    expect(hoursMismatch(parseSiteHours("sob: zaprto"), google)).toBe("Na strani piše, da ste ob sobotah zaprti, na Googlu pa, da ste odprti od 8h do 13h.");
    expect(hoursMismatch(parseSiteHours("pon 8.30-16"), google)).toBe("Na strani piše, da ste ob ponedeljkih odprti od 8.30h, na Googlu pa od 8h.");
  });
  it("lunch break periods merge; 24/7 and missing data → null", () => {
    const split = googleHours([
      { open: { day: 1, hour: 8 }, close: { day: 1, hour: 12 } },
      { open: { day: 1, hour: 13 }, close: { day: 1, hour: 17 } },
    ]);
    expect(split?.[1]).toEqual({ open: 480, close: 1020 });
    expect(googleHours([{ open: { day: 0, hour: 0 } }])).toBeNull();
    expect(hoursMismatch(null, google)).toBeNull();
  });
});
