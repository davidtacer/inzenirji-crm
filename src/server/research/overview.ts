import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { activities, aiUsage, companies, deals } from "../db/schema";
import { GeminiError, geminiConfig, groundedSearch } from "../google/gemini";

/*
 * "Google pregled" (TASK-037, ADR-039): the owner asks Gemini with Google Search about one company. The grounded
 * answer is stored as a note (text, Search Suggestions, sources) and shown unchanged; e-mails and links in the text
 * get buttons, and only what the owner clicks is saved.
 */

export const SEARCH_MICRO_USD = 14_000; // 14 USD per 1 000 searches after the free monthly quota (pricing 2026-10-16)

export function overviewPrompt(c: { name: string; category: string | null; address: string | null; city: string | null; phone: string | null; website: string | null }) {
  return [
    "Poišči na Googlu to podjetje v Sloveniji in mi naštej vse, kar je o njem javno objavljeno.",
    `Podjetje: ${c.name}`,
    c.category ? `Dejavnost: ${c.category}` : "",
    c.address ? `Naslov: ${c.address}` : "",
    c.phone ? `Telefon: ${c.phone}` : "",
    c.website ? `Znana povezava: ${c.website}` : "",
    "",
    "Išči tudi s krajšim imenom (brez s.p./d.o.o.) in z imenom lastnika. Preveri, da gre za isto podjetje (naslov, telefon).",
    "Naštej v kratkih alinejah, vsak podatek s polnim URL-jem vira:",
    "- uradna spletna stran (tudi če je samo v opisu na Instagramu/Facebooku ali kaže »v izdelavi«) in stare strani (Wix ipd.)",
    "- Facebook, Instagram, TikTok (URL, število sledilcev, kaj piše v opisu)",
    "- e-naslovi in telefoni (z URL-jem strani, kjer so objavljeni, npr. Facebook O nas, imenik)",
    "- pravna oseba (ime, naslov, davčna, vir) in prejšnji lastniki na istem naslovu",
    "- osebe, storitve, delovni čas, zanimiva dejstva za osebni e-mail",
    "Odgovori v slovenščini. Ničesar ne ugibaj.",
  ]
    .filter((l, i) => l !== "" || i > 0)
    .join("\n");
}

export type OverviewNote = { text: string; searchHtml: string | null; queries: string[]; sources: { title: string; uri: string }[]; model: string; at: string; error?: string };

/** Runs one Google overview for a company and stores it as a note on the deal. Returns a short message. */
export async function runOverview(db: Db, companyId: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const cfg = await geminiConfig(db);
  if (!cfg) return "Najprej vpiši ključ za Gemini v Nastavitvah.";
  const [row] = await db
    .select({ c: companies, dealId: deals.id })
    .from(companies)
    .leftJoin(deals, eq(deals.companyId, companies.id))
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!row?.dealId) return "Podjetje nima posla v CRM.";
  let note: OverviewNote;
  try {
    const g = await groundedSearch(cfg, overviewPrompt(row.c), fetchImpl);
    note = { text: g.text, searchHtml: g.searchHtml, queries: g.queries, sources: g.sources, model: cfg.model, at: new Date().toISOString() };
    await db.insert(aiUsage).values({
      job: "google_overview",
      model: cfg.model,
      companyId,
      inputTokens: g.inputTokens,
      outputTokens: g.outputTokens,
      costMicroUsd: g.queries.length * SEARCH_MICRO_USD,
      ok: !!g.text,
    });
  } catch (e) {
    const msg =
      e instanceof GeminiError
        ? e.status === 400 && /api key/i.test(e.detail ?? "")
          ? "Ključ za Gemini ni veljaven."
          : e.status === 404
            ? `Model ${cfg.model} ne obstaja; popravi ga v Nastavitvah.`
            : `Gemini je zavrnil zahtevo (${e.status}${e.detail ? `: ${e.detail}` : ""}).`
        : e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
          ? "Gemini se ni odzval v 60 sekundah."
          : "Google pregled ni uspel.";
    console.error("[overview] failed:", e instanceof GeminiError ? `${e.status} ${e.detail ?? ""}` : (e as Error)?.name);
    return msg;
  }
  await db.insert(activities).values({ dealId: row.dealId, type: "note", payload: { kind: "google_overview", ...note } });
  return "Google pregled je pripravljen.";
}

export async function latestOverview(db: Db, companyId: string): Promise<(OverviewNote & { id: string }) | null> {
  const [r] = await db
    .select({ id: activities.id, payload: activities.payload })
    .from(activities)
    .innerJoin(deals, eq(deals.id, activities.dealId))
    .where(and(eq(deals.companyId, companyId), eq(activities.type, "note"), sql`${activities.payload}->>'kind' = 'google_overview'`))
    .orderBy(desc(activities.at))
    .limit(1);
  return r ? { id: r.id, ...(r.payload as OverviewNote) } : null;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE = /https?:\/\/[^\s)\]>"'`]+/g;

/** E-mails and URLs written in the answer, for the owner's one-click buttons. */
export function mentioned(text: string): { emails: string[]; urls: string[] } {
  const emails = [...new Set((text.match(EMAIL) ?? []).map((e) => e.toLowerCase().replace(/\.$/, "")))];
  const urls = [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:]+$/, "")))].filter((u) => !/vertexaisearch|google\.com\/search/.test(u));
  return { emails, urls };
}

export function linkKind(url: string): string {
  const h = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  if (/facebook\.com$|fb\.com$/.test(h)) return "facebook";
  if (/instagram\.com$/.test(h)) return "instagram";
  if (/tiktok\.com$/.test(h)) return "tiktok";
  if (/linkedin\.com$/.test(h)) return "linkedin";
  if (/youtube\.com$/.test(h)) return "youtube";
  if (/(bizi|najdi|moja-dejavnost|imenik-podjetij|mojastoritev|stop-neplacniki|e-creditreform|itis|moje-podjetje|vsestoritve)\./.test(h)) return "directory";
  return "other";
}
