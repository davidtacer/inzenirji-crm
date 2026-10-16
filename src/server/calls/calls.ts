import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { activities, aiUsage, audits, companies, competitorLinks, deals, drafts, inboundMessages } from "../db/schema";
import { websiteKind } from "../contact/website";
import type { Issue } from "../research/analyze";
import { AiError, callClaude } from "../ai/anthropic";
import type { AiConfig } from "../ai/remark";
import { ownText } from "../mailbox/classify";

/*
 * Calls (TASK-012, ADR-027): stage changes by the owner, pre-call brief, call notes → structured summary.
 * Google Calendar sync comes later; the call time is entered by hand for now.
 */

export type Stage = "found" | "researched" | "contacted" | "replied" | "call_booked" | "call_done" | "proposal_sent" | "won" | "lost" | "nurture";

export const MATERIALS = [
  "Besedila (ali dovoljenje, da jih napišemo mi)",
  "Logotip",
  "Fotografije",
  "Cenik / seznam storitev",
  "Kontakti in delovni čas",
  "Jeziki strani",
  "Dostop do domene (DNS)",
] as const;

export type StageInput = { stage: Stage; callAt?: Date | null; lostReason?: string | null };

/** Owner moves a deal. A booked call needs a time, a lost deal a reason. Returns an error message or null. */
export async function setStage(db: Db, companyId: string, input: StageInput, now = new Date()): Promise<string | null> {
  const [d] = await db.select().from(deals).where(eq(deals.companyId, companyId)).limit(1);
  if (!d) return "Podjetje nima posla.";
  if (input.stage === "call_booked" && !input.callAt) return "Vpiši datum in uro klica.";
  const reason = input.lostReason?.trim() || null;
  if (input.stage === "lost" && !reason) return "Vpiši razlog, zakaj je posel izgubljen (pomaga pri analizi).";
  const nextActionAt =
    input.stage === "call_booked" ? input.callAt! : input.stage === "nurture" ? new Date(now.getTime() + 90 * 86_400_000) : null;
  await db
    .update(deals)
    .set({
      stage: input.stage,
      nextActionAt,
      callAt: input.stage === "call_booked" ? input.callAt! : d.callAt,
      lostReason: input.stage === "lost" ? reason : d.lostReason,
      updatedAt: now,
    })
    .where(eq(deals.id, d.id));
  // Moving past "contacted" stops the cold sequence: open follow-ups would be wrong now.
  if (!["found", "researched", "contacted"].includes(input.stage)) {
    await db
      .update(drafts)
      .set({ status: "discarded" })
      .where(and(eq(drafts.dealId, d.id), inArray(drafts.status, ["pending", "approved"]), inArray(drafts.kind, ["first", "followup_1", "followup_2"])));
  }
  await db.insert(activities).values({
    dealId: d.id,
    type: input.stage === "call_booked" ? "booking" : "stage_change",
    at: now,
    payload: { from: d.stage, to: input.stage, callAt: input.callAt?.toISOString() ?? null, reason, by: "owner" },
  });
  return null;
}

export type Brief = {
  source: "ai" | "rules";
  business: string;
  problems: string[];
  competitors: string;
  objections: string[];
  offer: string;
  questions: string[];
};

async function context(db: Db, companyId: string) {
  const [c] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!c) return null;
  const [audit] = await db.select().from(audits).where(eq(audits.companyId, companyId)).orderBy(desc(audits.createdAt)).limit(1);
  const rivals = await db
    .select({ name: companies.name, domain: companies.websiteDomain, ratingX10: companies.ratingX10, distanceM: competitorLinks.distanceM })
    .from(competitorLinks)
    .innerJoin(companies, eq(companies.id, competitorLinks.competitorId))
    .where(eq(competitorLinks.companyId, companyId))
    .orderBy(sql`${competitorLinks.distanceM} asc nulls last`)
    .limit(5);
  const replies = await db
    .select({ body: inboundMessages.bodyText, cls: inboundMessages.classification })
    .from(inboundMessages)
    .where(eq(inboundMessages.companyId, companyId))
    .orderBy(asc(inboundMessages.receivedAt))
    .limit(5);
  const data = (audit?.data ?? {}) as { google?: { summary?: string | null; reviews?: { rating: number | null; text: string }[] } | null; siteText?: string | null };
  return { c, issues: (audit?.issues ?? []) as Issue[], data, rivals, replies };
}

const OFFER_A = "Prenos obstoječe strani na našo platformo z urejevalnikom (stran urejajo sami s pisanjem sporočil). Cena individualna po pregledu obsega - povej jo šele, ko poznaš obseg.";
const OFFER_B = "Nova stran: 590 € + DDV, na spletu v 7 dneh od prejema vseh materialov, 50 % predplačila, garancija vračila.";
const DEFAULT_QUESTIONS = [
  "Kaj vam je pri sedanji spletni prisotnosti najbolj v napoto?",
  "Kdo danes spreminja vsebino strani in kako hitro?",
  "Koliko strani/podstrani potrebujete in v katerih jezikih?",
  "Imate besedila, slike in logotip pripravljene?",
  "Do kdaj bi želeli imeti novo stran?",
];

export function rulesBrief(ctx: NonNullable<Awaited<ReturnType<typeof context>>>): Brief {
  const { c, issues, data, rivals } = ctx;
  const withSite = rivals.filter((r) => websiteKind(r.domain) === "own");
  return {
    source: "rules",
    business: [c.category, c.city, c.ratingX10 !== null ? `ocena ${(c.ratingX10 / 10).toFixed(1).replace(".", ",")} (${c.reviewCount ?? 0} mnenj)` : null, data.google?.summary].filter(Boolean).join(" · "),
    problems: issues.filter((i) => i.severity !== "low").map((i) => i.text).slice(0, 5),
    competitors: rivals.length ? `${rivals.length} bližnjih, ${withSite.length} z lastno stranjo: ${rivals.map((r) => r.name).join(", ")}` : "Ni podatkov o konkurentih.",
    objections: ["Nimam časa za to.", "Koliko stane?", "Stran že imamo / nečak jo ureja."],
    offer: c.group === "B" ? OFFER_B : OFFER_A,
    questions: DEFAULT_QUESTIONS,
  };
}

const BRIEF_SYSTEM = `Pripravi kratek brief za Davida (inženirji.si) pred 15-minutnim prodajnim klicem z lastnikom lokalnega podjetja.
Uporabi samo podane podatke, nič ne izmišljuj. Slovenščina, jedrnato.
Ponudba: skupina A = prenos obstoječe strani na našo platformo z urejevalnikom (cena individualna, ne navajaj zneska); skupina B = nova stran 590 € + DDV, v 7 dneh od prejema materialov, garancija.
Odgovori samo z JSON:
{"business": "1-2 stavka kaj delajo in kako jim gre (ocene)",
 "problems": ["do 5 konkretnih težav njihove spletne prisotnosti"],
 "competitors": "1-2 stavka o bližnjih konkurentih in kaj imajo bolje",
 "objections": ["3 verjetni pomisleki tega lastnika + v oklepaju kratek odgovor"],
 "offer": "kaj točno ponuditi in zakaj prav njim",
 "questions": ["5 vprašanj za klic, ki razkrijejo obseg in nujnost"]}`;

function parseBrief(text: string): Omit<Brief, "source"> | null {
  try {
    const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "") as Record<string, unknown>;
    const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 6) : []);
    if (typeof j.business !== "string" || typeof j.offer !== "string") return null;
    return { business: j.business, problems: arr(j.problems), competitors: String(j.competitors ?? ""), objections: arr(j.objections), offer: j.offer, questions: arr(j.questions) };
  } catch {
    return null;
  }
}

export async function prepareBrief(db: Db, companyId: string, ai: AiConfig | null, now = new Date()): Promise<Brief | null> {
  const ctx = await context(db, companyId);
  if (!ctx) return null;
  let brief: Brief = rulesBrief(ctx);
  if (ai) {
    const { c, issues, data, rivals, replies } = ctx;
    const user = [
      `Podjetje: ${c.name} · ${c.category ?? ""} · ${c.city ?? ""} · skupina ${c.group ?? "?"}`,
      `Spletna stran: ${c.website ?? "nima"}`,
      c.ratingX10 !== null ? `Google: ${(c.ratingX10 / 10).toFixed(1)} (${c.reviewCount ?? 0} mnenj)` : "",
      data.google?.summary ? `Googlov opis: ${data.google.summary}` : "",
      `Težave: ${issues.map((i) => i.text).join(" | ") || "ni zaznanih"}`,
      `Konkurenti: ${rivals.map((r) => `${r.name} (${websiteKind(r.domain) === "own" ? "ima stran" : "brez strani"}${r.distanceM ? `, ${r.distanceM} m` : ""})`).join("; ") || "ni podatkov"}`,
      (data.google?.reviews ?? []).length ? `Mnenja: ${(data.google?.reviews ?? []).map((r) => r.text.slice(0, 250)).join(" | ")}` : "",
      replies.length ? `Njihovi odgovori: ${replies.map((r) => ownText(r.body).slice(0, 500)).join(" | ")}` : "",
      data.siteText ? `Izsek strani: ${data.siteText.slice(0, 2000)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      const r = await callClaude({ model: ai.model, system: BRIEF_SYSTEM, user, maxTokens: 900 }, { apiKey: ai.apiKey, fetchImpl: ai.fetchImpl });
      const parsed = parseBrief(r.text);
      await db.insert(aiUsage).values({ job: "brief", model: ai.model, companyId, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costMicroUsd: r.costMicroUsd, ok: !!parsed });
      if (parsed) brief = { source: "ai", ...parsed };
    } catch (e) {
      if (!(e instanceof AiError || (e instanceof Error && e.name === "AbortError"))) throw e;
    }
  }
  await db.update(deals).set({ brief, briefAt: now }).where(eq(deals.companyId, companyId));
  return brief;
}

export type CallSummary = {
  source: "ai" | "notes";
  summary: string;
  scope: string;
  wishes: string[];
  objections: string[];
  nextStep: string;
  package: "A" | "B" | null;
  materials: string[];
};

const NOTES_SYSTEM = `Iz Davidovih zapiskov prodajnega klica (izdelava spletnih strani) izlušči strukturiran povzetek. Samo to, kar piše v zapiskih.
Odgovori samo z JSON:
{"summary": "2-3 stavki", "scope": "obseg: podstrani, funkcije (rezervacije, trgovina...), jeziki", "wishes": ["želje stranke"], "objections": ["pomisleki"],
 "nextStep": "dogovorjen naslednji korak in rok", "package": "A" ali "B" ali null,
 "materials": ["kateri od teh materialov bodo potrebni: ${MATERIALS.join("; ")}"]}`;

export async function saveCallNotes(db: Db, companyId: string, notes: string, ai: AiConfig | null, now = new Date()): Promise<{ ok: true; summary: CallSummary } | { ok: false; message: string }> {
  const text = notes.trim();
  if (text.length < 10) return { ok: false, message: "Zapiski so prekratki." };
  const [d] = await db.select().from(deals).where(eq(deals.companyId, companyId)).limit(1);
  if (!d) return { ok: false, message: "Podjetje nima posla." };
  let summary: CallSummary = { source: "notes", summary: text.slice(0, 600), scope: "", wishes: [], objections: [], nextStep: "", package: null, materials: [...MATERIALS] };
  if (ai) {
    try {
      const r = await callClaude({ model: ai.model, system: NOTES_SYSTEM, user: text.slice(0, 6000), maxTokens: 700 }, { apiKey: ai.apiKey, fetchImpl: ai.fetchImpl });
      const j = JSON.parse(r.text.match(/\{[\s\S]*\}/)?.[0] ?? "null") as Record<string, unknown> | null;
      const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 10) : []);
      const ok = !!j && typeof j.summary === "string";
      await db.insert(aiUsage).values({ job: "call_notes", model: ai.model, companyId, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costMicroUsd: r.costMicroUsd, ok });
      if (ok && j) {
        summary = {
          source: "ai",
          summary: String(j.summary),
          scope: String(j.scope ?? ""),
          wishes: arr(j.wishes),
          objections: arr(j.objections),
          nextStep: String(j.nextStep ?? ""),
          package: j.package === "A" || j.package === "B" ? j.package : null,
          materials: arr(j.materials).length ? arr(j.materials) : [...MATERIALS],
        };
      }
    } catch (e) {
      if (!(e instanceof AiError || (e instanceof Error && e.name === "AbortError") || e instanceof SyntaxError)) throw e;
    }
  }
  await db.insert(activities).values({ dealId: d.id, type: "call", at: now, payload: { notes: text, summary } });
  const done = ["contacted", "replied", "call_booked", "researched", "found"].includes(d.stage);
  await db
    .update(deals)
    .set({ callSummary: summary, ...(done ? { stage: "call_done" as const, nextActionAt: null } : {}), updatedAt: now })
    .where(eq(deals.id, d.id));
  return { ok: true, summary };
}

export async function callNotesHistory(db: Db, companyId: string) {
  return db
    .select({ at: activities.at, payload: activities.payload })
    .from(activities)
    .innerJoin(deals, eq(deals.id, activities.dealId))
    .where(and(eq(deals.companyId, companyId), eq(activities.type, "call")))
    .orderBy(desc(activities.at));
}

/** The "Klici" page: who replied, booked calls by time, calls waiting for a proposal. */
export async function callsBoard(db: Db) {
  const rows = await db
    .select({
      companyId: companies.id,
      name: companies.name,
      city: companies.city,
      category: companies.category,
      group: companies.group,
      phone: companies.phone,
      stage: deals.stage,
      callAt: deals.callAt,
      hasBrief: sql<boolean>`${deals.brief} is not null`,
      summary: deals.callSummary,
      updatedAt: deals.updatedAt,
    })
    .from(deals)
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(inArray(deals.stage, ["replied", "call_booked", "call_done"]))
    .orderBy(sql`${deals.callAt} asc nulls last`, desc(deals.updatedAt));
  return {
    replied: rows.filter((r) => r.stage === "replied"),
    booked: rows.filter((r) => r.stage === "call_booked"),
    done: rows.filter((r) => r.stage === "call_done"),
  };
}
