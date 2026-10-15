/*
 * Opening hours from the company's own pages vs. Google (TASK-023). The plan's strongest personal remark:
 * "Na strani piše, da ste ob sobotah odprti do 12h, na Googlu pa do 13h."
 * Days are 1 = Monday … 7 = Sunday. Times are minutes after midnight. null = closed.
 */

export type DayHours = { open: number; close: number } | null;
export type WeekHours = Partial<Record<number, DayHours>>;

const L = "a-zčšžćđ";
const DAY_WORDS: [number, string][] = [
  [1, "pon(?:edeljek|edeljka|\\.)?"],
  [2, "tor(?:ek|ka|\\.)?"],
  [3, "sre(?:da|de|\\.)?"],
  [4, "(?:čet|cet)(?:rtek|rtka|\\.)?"],
  [5, "pet(?:ek|ka|\\.)?"],
  [6, "sob(?:ota|ote|\\.)?"],
  [7, "ned(?:elja|elje|\\.)?"],
];
const DAY = `(?<![${L}])(${DAY_WORDS.map(([, w]) => w).join("|")})(?![${L}])`;
const TIME = "(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:h|ure|ura)?";
const SEP = "\\s*(?:-|–|—|do|in)\\s*";
const RE = new RegExp(`${DAY}(?:${SEP}${DAY})?\\s*[:.,]?\\s*(?:od\\s*)?(?:${TIME}${SEP}${TIME}|(zaprto|zaprti))`, "gi");

function dayOf(word: string): number {
  const w = word.toLowerCase();
  return DAY_WORDS.find(([, re]) => new RegExp(`^${re}$`, "i").test(w))?.[0] ?? 0;
}

/**
 * Parses hours like "Pon - Pet: 8:00 - 16:00", "sobota 8.00–12.00", "ned: zaprto".
 * Returns null when nothing is found or when the same day appears with different hours
 * (several locations or seasonal hours — too risky to quote).
 */
export function parseSiteHours(text: string): WeekHours | null {
  const out: WeekHours = {};
  const seen = new Map<number, string>();
  let any = false;
  for (const m of text.matchAll(RE)) {
    const from = dayOf(m[1]);
    const to = m[2] ? dayOf(m[2]) : from;
    if (!from || !to || to < from) continue;
    let value: DayHours;
    if (m[7]) value = null;
    else {
      const oh = Number(m[3]);
      const om = Number(m[4] ?? 0);
      const ch = Number(m[5]);
      const cm = Number(m[6] ?? 0);
      if (oh > 23 || ch > 24 || om > 59 || cm > 59) continue;
      const open = oh * 60 + om;
      const close = ch * 60 + cm;
      if (close <= open) continue;
      value = { open, close };
    }
    for (let d = from; d <= to; d++) {
      const key = JSON.stringify(value);
      if (seen.has(d) && seen.get(d) !== key) return null;
      seen.set(d, key);
      out[d] = value;
      any = true;
    }
  }
  return any ? out : null;
}

type GooglePeriod = { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } };

/** Google `regularOpeningHours.periods` (day 0 = Sunday) → WeekHours; days without a period are closed. */
export function googleHours(periods: GooglePeriod[] | undefined): WeekHours | null {
  if (!periods?.length) return null;
  // Open 24/7 is one period without close.
  if (periods.length === 1 && !periods[0].close) return null;
  const out: WeekHours = {};
  for (let d = 1; d <= 7; d++) out[d] = null;
  for (const p of periods) {
    if (p.open?.day === undefined || !p.close) continue;
    const d = p.open.day === 0 ? 7 : p.open.day;
    const open = (p.open.hour ?? 0) * 60 + (p.open.minute ?? 0);
    let close = (p.close.hour ?? 0) * 60 + (p.close.minute ?? 0);
    if (p.close.day !== p.open.day) close = 24 * 60;
    const cur = out[d];
    out[d] = cur ? { open: Math.min(cur.open, open), close: Math.max(cur.close, close) } : { open, close };
  }
  return out;
}

const LOC = ["", "ponedeljkih", "torkih", "sredah", "četrtkih", "petkih", "sobotah", "nedeljah"];
const fmt = (min: number) => `${Math.floor(min / 60)}${min % 60 ? `.${String(min % 60).padStart(2, "0")}` : ""}h`;

/** First real difference (≥ 30 min, or open vs. closed), as a Slovenian sentence; null when they agree. */
export function hoursMismatch(site: WeekHours | null, google: WeekHours | null): string | null {
  if (!site || !google) return null;
  // Saturday first: it is where differences hurt most and the classic example.
  for (const d of [6, 1, 2, 3, 4, 5, 7]) {
    if (!(d in site) || !(d in google)) continue;
    const a = site[d];
    const b = google[d];
    if (a === null && b === null) continue;
    if (a === null && b) return `Na strani piše, da ste ob ${LOC[d]} zaprti, na Googlu pa, da ste odprti od ${fmt(b.open)} do ${fmt(b.close)}.`;
    if (a && b === null) return `Na strani piše, da ste ob ${LOC[d]} odprti od ${fmt(a.open)} do ${fmt(a.close)}, na Googlu pa, da ste zaprti.`;
    if (a && b && Math.abs(a.close - b.close) >= 30) return `Na strani piše, da ste ob ${LOC[d]} odprti do ${fmt(a.close)}, na Googlu pa do ${fmt(b.close)}.`;
    if (a && b && Math.abs(a.open - b.open) >= 30) return `Na strani piše, da ste ob ${LOC[d]} odprti od ${fmt(a.open)}, na Googlu pa od ${fmt(b.open)}.`;
  }
  return null;
}
