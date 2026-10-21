import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { AiError, callClaude } from "../ai/anthropic";
import type { AiConfig } from "../ai/remark";
import { defaultDomainCheck, type DomainCheck } from "../contact/domain";
import { domainOf } from "../contact/normalize";
import type { Db } from "../db/client";
import { aiUsage, heldInquiries, inboundMessages } from "../db/schema";
import type { WebsiteLead } from "./website";

/*
 * Guard for the inzenirji.si form (owner 2026-10-21: "da ne dobivamo neki fejk, scam, žaljivih sporočil").
 * 1. The e-mail's domain must exist (otherwise the visitor is asked to fix it; nothing is stored).
 * 2. Rules: more than 2 links, or more than 3 inquiries from one address in 24 h → held.
 * 3. AI (Haiku, structured output) holds clear spam, scams/phishing, insults and jokes/tests; a short or vague real
 *    question passes. Errors let the inquiry through (a real client must never be lost).
 * Held inquiries create no company, no draft and no e-mail to the owner; they are listed on Odgovori and the owner
 * can release one with one click.
 */

export type Verdict = "ok" | "spam" | "scam" | "offensive" | "test";
export type GuardResult = { action: "accept" } | { action: "reject_email" } | { action: "hold"; verdict: Exclude<Verdict, "ok">; reason: string };

export const VERDICT_LABEL: Record<Exclude<Verdict, "ok">, string> = {
  spam: "Oglaševanje / spam",
  scam: "Prevara",
  offensive: "Žaljivo",
  test: "Test / šala",
};

const GUARD_MODEL = "claude-haiku-5-5";

const SYSTEM = `Si filter za kontaktni obrazec na inzenirji.si (izdelava spletnih strani za mala podjetja v Sloveniji).
Oceni, ali je sporočilo pravo povpraševanje človeka. Bodi popustljiv: kratko, nejasno, slovnično slabo ali tuje sporočilo je "ok", če bi lahko bil pravi kupec ali vprašanje.
Označi SAMO jasne primere:
- "spam": ponujajo nam svoje storitve (SEO, marketing, oglasi, razvijalci, povezave), kripto, oglasi, zbiranje povezav.
- "scam": prevara, phishing, zahteva za plačilo ali podatke, lažna nagrada, izsiljevanje.
- "offensive": žalitve, grožnje, vulgarnost, nadlegovanje.
- "test": šala, nesmisel, preizkus obrazca, posmeh (npr. "test", "asdf", "AI slop", izmišljeno ime z lažno domeno).
reason: en kratek stavek v slovenščini (do 15 besed), zakaj.`;

const SCHEMA = {
  type: "object",
  properties: { verdict: { type: "string", enum: ["ok", "spam", "scam", "offensive", "test"] }, reason: { type: "string" } },
  required: ["verdict", "reason"],
  additionalProperties: false,
};

const links = (s: string) => (s.match(/https?:\/\/|www\.[a-z0-9-]+\./gi) ?? []).length;

export async function guardLead(db: Db, lead: WebsiteLead, deps: { ai: AiConfig | null; checkDomain?: DomainCheck; now?: Date }): Promise<GuardResult> {
  const now = deps.now ?? new Date();
  const domain = domainOf(lead.email);
  if (!domain || (await (deps.checkDomain ?? defaultDomainCheck)(domain)) === "no") return { action: "reject_email" };

  const text = `${lead.name}\n${lead.company ?? ""}\n${lead.message}`;
  if (links(text) > 2) return { action: "hold", verdict: "spam", reason: "Sporočilo ima več kot 2 povezavi." };
  const since = new Date(now.getTime() - 86_400_000).toISOString();
  const [{ n }] = await db
    .select({ n: sql<number>`(select count(*)::int from ${inboundMessages} where ${inboundMessages.fromEmail} = ${lead.email} and ${inboundMessages.classifiedBy} = 'form' and ${inboundMessages.receivedAt} >= ${since}) + (select count(*)::int from ${heldInquiries} where ${heldInquiries.email} = ${lead.email} and ${heldInquiries.at} >= ${since})` })
    .from(sql`(select 1) as x`);
  if (n >= 3) return { action: "hold", verdict: "spam", reason: "Več kot 3 sporočila z istega naslova v 24 urah." };

  if (!deps.ai) return { action: "accept" };
  try {
    const r = await callClaude(
      {
        model: GUARD_MODEL,
        system: SYSTEM,
        user: [`Ime: ${lead.name}`, `E-naslov: ${lead.email}`, lead.company ? `Podjetje: ${lead.company}` : "", lead.phone ? `Telefon: ${lead.phone}` : "", `Sporočilo:\n${lead.message || "(prazno)"}`].filter(Boolean).join("\n").slice(0, 4000),
        maxTokens: 400,
        schema: SCHEMA,
      },
      { apiKey: deps.ai.apiKey, fetchImpl: deps.ai.fetchImpl, timeoutMs: 20_000 },
    );
    let v: { verdict?: string; reason?: string } = {};
    try {
      v = JSON.parse(r.text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    } catch {
      v = {};
    }
    await db.insert(aiUsage).values({ job: "form_guard", model: GUARD_MODEL, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costMicroUsd: r.costMicroUsd, ok: !!v.verdict });
    if (v.verdict && v.verdict !== "ok" && v.verdict in VERDICT_LABEL) {
      return { action: "hold", verdict: v.verdict as Exclude<Verdict, "ok">, reason: (v.reason ?? "").trim().slice(0, 200) || VERDICT_LABEL[v.verdict as Exclude<Verdict, "ok">] };
    }
  } catch (e) {
    if (!(e instanceof AiError || (e instanceof Error && e.name === "AbortError"))) console.error("[form_guard]", e instanceof Error ? e.message.slice(0, 120) : "unknown");
  }
  return { action: "accept" };
}

export async function holdLead(db: Db, lead: WebsiteLead, g: Extract<GuardResult, { action: "hold" }>) {
  await db
    .insert(heldInquiries)
    .values({ ref: lead.ref, email: lead.email, name: lead.name, message: lead.message, verdict: g.verdict, reason: g.reason, lead: { ...lead, at: lead.at.toISOString() }, at: lead.at })
    .onConflictDoNothing();
}

export async function listHeld(db: Db, now = new Date()) {
  return db
    .select()
    .from(heldInquiries)
    .where(and(isNull(heldInquiries.releasedAt), gte(heldInquiries.at, new Date(now.getTime() - 30 * 86_400_000))))
    .orderBy(desc(heldInquiries.at))
    .limit(50);
}

/** The owner says it is a real inquiry: it goes into the CRM like any other (company, conversation, reply draft). */
export async function releaseHeld(db: Db, id: string, deps: Parameters<typeof import("./website").importWebsiteLead>[2], now = new Date()) {
  const [h] = await db.select().from(heldInquiries).where(and(eq(heldInquiries.id, id), isNull(heldInquiries.releasedAt))).limit(1);
  if (!h) return null;
  const raw = h.lead as Omit<WebsiteLead, "at"> & { at: string };
  const { importWebsiteLead } = await import("./website");
  const r = await importWebsiteLead(db, { ...raw, at: new Date(raw.at) }, deps);
  await db.update(heldInquiries).set({ releasedAt: now }).where(eq(heldInquiries.id, id));
  return r;
}
