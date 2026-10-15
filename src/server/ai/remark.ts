import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { aiUsage, audits, companies } from "../db/schema";
import type { Issue } from "../research/analyze";
import { AiError, callClaude } from "./anthropic";

/*
 * AI personal remark for the first e-mail (TASK-024, ADR-021). Claude reads only what research already stored
 * (problems, site text, Google summary and reviews) and writes the sentence after "opazil sem, da …".
 * Called when a draft is prepared, once per audit; the owner still reviews every draft (ADR-004).
 */

export type AiConfig = { apiKey: string; model: string; dailyBudgetMicroUsd: number; fetchImpl?: typeof fetch };

export function aiConfigFromEnv(env: Record<string, string | undefined> = process.env): AiConfig | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  return {
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.AI_MODEL || "claude-sonnet-5-5",
    dailyBudgetMicroUsd: Math.round(Number(env.AI_DAILY_BUDGET_USD ?? 2) * 1_000_000),
  };
}

export const SYSTEM = `Si David, ustanovitelj inženirji.si iz Maribora. Pišeš kratka, osebna prodajna sporočila lokalnim podjetjem.
Napiši NADALJEVANJE stavka »Pozdravljeni, opazil sem, da …« za to podjetje.

Pravila:
- 1 do 2 kratka stavka, skupaj največ 40 besed, v slovenščini, vikanje.
- Najprej ena konkretna slabost njihove spletne prisotnosti iz PODATKOV (npr. drug delovni čas kot na Googlu, letnica v nogi, stran ni za telefone, nimajo strani).
- Nato, če iz mnenj ali besedila strani izhaja nekaj res posebnega in pozitivnega, to na kratko in iskreno omeni (npr. kaj stranke hvalijo). Brez pretiravanja in brez navajanja imen ljudi.
- Uporabljaj SAMO dejstva iz PODATKOV. Ničesar ne izmišljuj. Če dejstvo ni navedeno, ga ne omenjaj.
- Brez cen, brez ponudbe, brez »mi«, brez omembe umetne inteligence, brez pozdrava, brez narekovajev.
- Navaden vezaj (-), nikoli dolgi pomišljaj (—).
- Začni z malo črko in NE ponovi besed »opazil sem, da«.

Odgovori samo z JSON: {"remark": "...", "basis": "katero dejstvo si uporabil, 3-8 besed"}`;

type AuditData = {
  siteText?: string | null;
  google?: { summary?: string | null; reviews?: { rating: number | null; text: string }[] } | null;
};

export function buildPrompt(c: { name: string; category: string | null; city: string | null; websiteDomain: string | null; ratingX10: number | null; reviewCount: number | null }, issues: Issue[], data: AuditData): string {
  const lines = [
    `Podjetje: ${c.name}`,
    c.category ? `Dejavnost: ${c.category}` : null,
    c.city ? `Kraj: ${c.city}` : null,
    `Spletna stran: ${c.websiteDomain ?? "nima"}`,
    c.ratingX10 !== null ? `Google ocena: ${(c.ratingX10 / 10).toFixed(1).replace(".", ",")} (${c.reviewCount ?? 0} mnenj)` : null,
    "",
    "Zaznane težave (najpomembnejša prva):",
    ...(issues.length ? issues.map((i) => `- ${i.text}`) : ["- (ni zaznanih)"]),
  ];
  if (data.google?.summary) lines.push("", `Googlov opis: ${data.google.summary}`);
  const reviews = (data.google?.reviews ?? []).filter((r) => r.text).slice(0, 5);
  if (reviews.length) lines.push("", "Zadnja Google mnenja:", ...reviews.map((r) => `- (${r.rating ?? "?"}★) ${r.text.slice(0, 400)}`));
  if (data.siteText) lines.push("", "Besedilo z njihove spletne strani (izsek):", data.siteText.slice(0, 3500));
  return `PODATKI\n${lines.filter((l) => l !== null).join("\n")}`;
}

/** Validates and tidies the model output; null when it breaks the rules. */
export function cleanRemark(text: string): { remark: string; basis: string } | null {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  let parsed: { remark?: unknown; basis?: unknown };
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed.remark !== "string") return null;
  let r = parsed.remark.trim().replace(/[—–]/g, "-").replace(/^["»„]|["«“]$/g, "").replace(/^opazil sem,? da\s+/i, "").replace(/\.+$/, "");
  if (!r) return null;
  r = r.charAt(0).toLowerCase() + r.slice(1);
  const words = r.split(/\s+/).length;
  if (words < 4 || words > 55 || /€|eur\b|cena|umetn[a-z]* inteligenc|\bAI\b/i.test(r)) return null;
  return { remark: r, basis: typeof parsed.basis === "string" ? parsed.basis.trim().slice(0, 120) : "" };
}

export async function spentTodayMicroUsd(db: Db, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 24 * 3600_000);
  const [r] = await db.select({ n: sql<number>`coalesce(sum(${aiUsage.costMicroUsd}), 0)::int` }).from(aiUsage).where(gte(aiUsage.createdAt, since));
  return r?.n ?? 0;
}

export type AiRemark = { remark: string; basis: string; model: string };

/**
 * Returns the AI remark for the company's latest audit, generating and storing it once.
 * Null when AI is off, over budget, the call fails or the answer breaks the rules — the caller falls back to rules.
 */
export async function ensureAiRemark(db: Db, companyId: string, cfg: AiConfig | null, now = new Date()): Promise<AiRemark | null> {
  if (!cfg) return null;
  const [audit] = await db.select().from(audits).where(eq(audits.companyId, companyId)).orderBy(desc(audits.createdAt)).limit(1);
  if (!audit) return null;
  const data = (audit.data ?? {}) as AuditData & { ai?: AiRemark | null };
  if (data.ai?.remark) return data.ai;
  if ((await spentTodayMicroUsd(db, now)) >= cfg.dailyBudgetMicroUsd) return null;
  const [c] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!c) return null;
  try {
    const res = await callClaude(
      { model: cfg.model, system: SYSTEM, user: buildPrompt(c, (audit.issues ?? []) as Issue[], data), maxTokens: 300 },
      { apiKey: cfg.apiKey, fetchImpl: cfg.fetchImpl },
    );
    const clean = cleanRemark(res.text);
    await db.insert(aiUsage).values({
      job: "remark",
      model: cfg.model,
      companyId,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      costMicroUsd: res.costMicroUsd,
      ok: !!clean,
    });
    if (!clean) return null;
    const ai: AiRemark = { ...clean, model: cfg.model };
    await db
      .update(audits)
      .set({ data: sql`${audits.data} || ${JSON.stringify({ ai })}::jsonb` })
      .where(and(eq(audits.id, audit.id)));
    return ai;
  } catch (e) {
    if (e instanceof AiError || (e instanceof Error && e.name === "AbortError")) {
      console.error("[ai] remark failed:", e.message);
      return null;
    }
    throw e;
  }
}
