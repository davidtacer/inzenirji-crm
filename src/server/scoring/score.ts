/*
 * Lead score 0–100 (TASK-007, product spec §5.3). Transparent: every part is returned with a Slovenian reason,
 * shown on the company page. Pure function — no database.
 */
import type { Issue } from "../research/analyze";

export type WebsiteKind = "own" | "social" | "link" | "none";

export type ScoreInput = {
  ratingX10: number | null;
  reviewCount: number | null;
  kind: WebsiteKind;
  reachable: boolean;
  issues: Issue[];
  /** Website kinds of linked competitors. */
  competitorKinds: WebsiteKind[];
  hasEmail: boolean;
  hasPhone: boolean;
  doNotContact: boolean;
};

export type ScorePart = { key: "business" | "opportunity" | "gap" | "reach"; label: string; points: number; max: number; reason: string };
export type Score = { total: number; parts: ScorePart[] };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function scoreLead(i: ScoreInput): Score {
  if (i.doNotContact) {
    return { total: 0, parts: [{ key: "reach", label: "Dosegljivost", points: 0, max: 15, reason: "Na seznamu »ne kontaktiraj«." }] };
  }
  // Business quality: rating 4.0 → 0 … 5.0 → 20; reviews 10 → 0 … 300+ → 15 (log scale).
  const rating = i.ratingX10 ?? 0;
  const ratingPts = clamp(Math.round(((rating - 40) / 10) * 20), 0, 20);
  const reviews = i.reviewCount ?? 0;
  const reviewPts = reviews <= 10 ? 0 : clamp(Math.round((Math.log10(reviews / 10) / Math.log10(30)) * 15), 0, 15);
  const business: ScorePart = {
    key: "business",
    label: "Kakovost posla",
    points: ratingPts + reviewPts,
    max: 35,
    reason: i.ratingX10 !== null ? `Ocena ${(rating / 10).toFixed(1).replace(".", ",")} iz ${reviews} ocen.` : "Brez ocen na Googlu.",
  };

  // Opportunity: how weak the web presence is.
  let opp: number;
  let oppReason: string;
  if (i.kind === "none") [opp, oppReason] = [35, "Nima spletne strani."];
  else if (i.kind === "social" || i.kind === "link") [opp, oppReason] = [32, "Ima samo profil ali stran s povezavami."];
  else if (!i.reachable) [opp, oppReason] = [30, "Spletna stran se ne odpre."];
  else {
    const w = { high: 12, medium: 6, low: 2 } as const;
    opp = clamp(i.issues.reduce((s, x) => s + w[x.severity], 0), 0, 35);
    const serious = i.issues.filter((x) => x.severity !== "low").length;
    oppReason = serious ? `${serious} pomembnih težav na strani.` : "Stran nima večjih težav.";
  }
  const opportunity: ScorePart = { key: "opportunity", label: "Priložnost", points: opp, max: 35, reason: oppReason };

  // Competitive gap: neighbours have an own site while this one is weak.
  const weak = i.kind !== "own" || !i.reachable || i.issues.some((x) => x.severity === "high");
  const withSite = i.competitorKinds.filter((k) => k === "own").length;
  const gapPts = !weak ? 0 : withSite >= 3 ? 15 : withSite === 2 ? 11 : withSite === 1 ? 6 : 0;
  const gap: ScorePart = {
    key: "gap",
    label: "Razlika s konkurenti",
    points: gapPts,
    max: 15,
    reason: i.competitorKinds.length === 0 ? "Konkurenti še niso znani." : `${withSite} od ${i.competitorKinds.length} konkurentov ima svojo stran.`,
  };

  const reachPts = (i.hasEmail ? 10 : 0) + (i.hasPhone ? 5 : 0);
  const reach: ScorePart = {
    key: "reach",
    label: "Dosegljivost",
    points: reachPts,
    max: 15,
    reason: [i.hasEmail ? "objavljen e-naslov" : "brez e-naslova", i.hasPhone ? "telefon" : "brez telefona"].join(", ") + ".",
  };

  const parts = [business, opportunity, gap, reach];
  return { total: clamp(parts.reduce((s, p) => s + p.points, 0), 0, 100), parts };
}
