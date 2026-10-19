import { desc, eq } from "drizzle-orm";
import { callClaude } from "../ai/anthropic";
import { AVOID_PHRASES_RULE, aiPhrases } from "../ai/humanize";
import { type AiConfig, buildPrompt, spentTodayMicroUsd } from "../ai/remark";
import type { Db } from "../db/client";
import { aiUsage, audits, companies } from "../db/schema";
import type { Issue } from "../research/analyze";
import { DEMO_URL, OPT_OUT_LINE, SIGNATURE, type Composed } from "./compose";

/*
 * The whole first e-mail written by AI for each company (ADR-045; owner 2026-10-19: "ful so podobni osnutki ...
 * rad bi da AI sestavlja emaile"). The model gets everything research knows and fixed facts about the offer; the CRM
 * checks the result (offer, price, demo link, vikanje, length, no competitors, no invented links) and adds the
 * signature and opt-out itself. A text that fails twice falls back to the template. The owner still approves each.
 */

export const FIRST_EMAIL_SYSTEM = `Si David iz inženirji.si. Pišeš PRVI e-mail lastniku malega podjetja v Sloveniji, ki ga ne poznaš. Mail mora zveneti, kot da si ga napisal sam, prav za to podjetje - ne kot predloga.

Pravila:
- Slovenščina, vikanje (Vi, vaš, imate), sproščen in vljuden ton, brez prodajnega pretiravanja.
- Telo 70-120 besed, kratki odstavki (2-4 stavki na odstavek, prazna vrstica med njimi).
- Začni s »Pozdravljeni,« v svoji vrstici. Nato 1-2 konkretni, resnični opazki o njih iz PODATKOV: kaj stranke hvalijo, kaj vidiš na njihovem Instagramu/Facebooku, kaj jim manjka na spletu. Uporabi SAMO dejstva iz PODATKOV, nič ne izmišljuj (tudi številk ne).
- Vsak mail naj bo drugače zgrajen in ubesedeno. Ne začni vedno z »opazil sem«.
- Predstavi se v enem stavku: David iz inženirji.si.
- PONUDBA (obvezno, vsebinsko točno): {OFFER}
- NAJVEČJA PREDNOST (obvezno, lahko skoraj dobesedno): »Potem jo urejate sami, kar preko klepeta: napišete, kaj želite spremeniti, ali pošljete sliko, AI pa to uredi v nekaj sekundah. Preizkusite tukaj: ${DEMO_URL}« (točno ta povezava, edina povezava v mailu).
- Zaključek: povabi, naj na kratko odpišejo, da se za 15 minut slišite po telefonu.{COFFEE}
- PREPOVEDANO: omenjati konkurenco ali druga podjetja, izmišljena dejstva, imena oseb iz mnenj, besedo »čist«, WordPress, superlative (najboljši, edinstven), emoji, dolgi pomišljaj (uporabi navaden vezaj -), druge povezave, podpis in P.S. (doda ju sistem), oglate oklepaje.
- Zadeva: kratka (do 60 znakov), osebna, brez clickbaita in klicajev, lahko z imenom podjetja.
- {HUMAN}

Odgovori samo z JSON: {"subject": "...", "body": "..."}`;

const OFFER_B = "naredimo novo spletno stran za 590 € + DDV, na spletu je v 7 dneh od prejema vseh materialov. Stran je hitra, na telefonu se odpre v trenutku, najdejo pa jo tudi Google, ChatGPT in drugi AI iskalniki.";
const OFFER_A = "vsebino njihove obstoječe strani prenesemo na našo platformo, da je hitra, na telefonu se odpre v trenutku in jo najdejo tudi Google in ChatGPT. Cene NE omenjaj.";

export function systemFor(group: "A" | "B" | null, city: string | null): string {
  return FIRST_EMAIL_SYSTEM.replace("{HUMAN}", AVOID_PHRASES_RULE).replace("{OFFER}", group === "A" ? OFFER_A : OFFER_B).replace(
    "{COFFEE}",
    /maribor/i.test(city ?? "") ? " Ker sta oba v Mariboru, lahko namesto klica ponudiš kavo." : "",
  );
}

const WORDS = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Tidies the model text and checks it; returns the e-mail or the list of problems. */
export function checkAiEmail(
  raw: string,
  ctx: { group: "A" | "B" | null; rivals: string[]; companyName: string },
): { ok: true; email: Composed } | { ok: false; problems: string[] } {
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  let parsed: { subject?: unknown; body?: unknown } = {};
  try {
    parsed = json ? JSON.parse(json) : {};
  } catch {
    return { ok: false, problems: ["ni JSON"] };
  }
  if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") return { ok: false, problems: ["manjka zadeva ali besedilo"] };
  const subject = parsed.subject.replace(/[—–]/g, "-").replace(/\s+/g, " ").trim().replace(/!+$/, "");
  let body = parsed.body
    .replace(/\r\n/g, "\n")
    .replace(/[—–]/g, "-")
    .replace(/(https?:\/\/)?(www\.)?inzenirji\.si\/demo\/?/gi, DEMO_URL)
    .trim();
  // A signature or P.S. the model added anyway is cut; the CRM adds its own.
  body = body.replace(/\n+(lp|lep pozdrav|lepo pozdravljeni|s spoštovanjem)[,.]?\s*\n[\s\S]*$/i, "").replace(/\n+P\.?\s?S\.?[\s\S]*$/i, "").trim();
  const problems: string[] = [];
  if (!/^Pozdravljeni,/.test(body)) problems.push("ne začne s »Pozdravljeni,«");
  if (!body.includes(DEMO_URL)) problems.push("manjka povezava na demo");
  if (!/urejevalnik|urejate sami|uredite sami|urejali sami|preko klepeta|prek klepeta/i.test(body)) problems.push("manjka AI urejevalnik");
  if (ctx.group !== "A" && !/590\s?€\s?\+\s?DDV/.test(body)) problems.push("manjka cena 590 € + DDV");
  if (ctx.group !== "A" && !/7 dn/.test(body)) problems.push("manjka 7 dni");
  if (ctx.group === "A" && /€|eur\b/i.test(body)) problems.push("cena pri prenosu");
  const words = WORDS(body);
  if (words < 55 || words > 140) problems.push(`dolžina ${words} besed`);
  if (/(?<!\p{L})(ti|tebi|tvoj\p{L}*|imaš|veš|želiš|boš)(?!\p{L})/iu.test(body)) problems.push("tikanje");
  if (/čist/i.test(body)) problems.push("beseda »čist«");
  for (const p of aiPhrases(`${subject}\n${body}`)) problems.push(`AI fraza »${p}«`);
  if (/wordpress/i.test(body)) problems.push("WordPress");
  if (/konkurenc/i.test(body)) problems.push("konkurenca");
  for (const r of ctx.rivals) if (r && r.length > 3 && body.toLowerCase().includes(r.toLowerCase())) problems.push(`omenja ${r}`);
  if (/\[|\]/.test(body)) problems.push("oglati oklepaji");
  const links = body.match(/https?:\/\/\S+/g) ?? [];
  if (links.some((l) => !l.startsWith(DEMO_URL) && !/^https:\/\/www\.inzenirji\.si\/?$/.test(l.replace(/[.,)]+$/, "")))) problems.push("tuja povezava");
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(body)) problems.push("e-naslov v besedilu");
  if (!subject || subject.length > 70) problems.push("zadeva");
  if (problems.length) return { ok: false, problems };
  return { ok: true, email: { subject, body: [body, SIGNATURE, OPT_OUT_LINE].join("\n\n") } };
}

/**
 * The AI first e-mail for a company, or null (AI off, over budget, failed twice); the caller falls back to the
 * template. Every call is logged in ai_usage as "first_email".
 */
export async function aiFirstEmail(db: Db, companyId: string, cfg: AiConfig | null, rivals: string[], now = new Date()): Promise<(Composed & { model: string }) | { reason: string }> {
  if (!cfg) return { reason: "AI je izklopljen (ključ ali dnevni AI proračun v Nastavitvah)" };
  const [c] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const [audit] = await db.select().from(audits).where(eq(audits.companyId, companyId)).orderBy(desc(audits.createdAt)).limit(1);
  if (!c || !audit) return { reason: "podjetje še ni raziskano" };
  const user = buildPrompt(c, (audit.issues ?? []) as Issue[], (audit.data ?? {}) as Parameters<typeof buildPrompt>[2]);
  let feedback = "";
  let lastProblems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    if ((await spentTodayMicroUsd(db, now)) >= cfg.dailyBudgetMicroUsd) return { reason: "dnevni AI proračun je porabljen" };
    try {
      const res = await callClaude(
        { model: cfg.model, system: systemFor(c.group, c.city), user: user + feedback, maxTokens: 900 },
        { apiKey: cfg.apiKey, fetchImpl: cfg.fetchImpl, timeoutMs: 60_000 },
      );
      const checked = checkAiEmail(res.text, { group: c.group, rivals, companyName: c.name });
      await db.insert(aiUsage).values({
        job: "first_email",
        model: cfg.model,
        companyId,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        costMicroUsd: res.costMicroUsd,
        ok: checked.ok,
      });
      if (checked.ok) return { ...checked.email, model: cfg.model };
      lastProblems = checked.problems;
      feedback = `\n\nPREJŠNJI POSKUS NI USTREZAL PRAVILOM (${checked.problems.join("; ")}). Napiši znova in upoštevaj vsa pravila.`;
    } catch (e) {
      console.error("[first_email] AI failed:", e instanceof Error ? e.message.slice(0, 120) : "unknown");
      return { reason: "AI se ni odzval" };
    }
  }
  return { reason: `AI besedilo ni prestalo preverjanja (${lastProblems.join("; ")})` };
}
