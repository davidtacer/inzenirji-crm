import { desc, eq } from "drizzle-orm";
import { callClaude } from "../ai/anthropic";
import { AVOID_PHRASES_RULE, aiPhrases } from "../ai/humanize";
import { type AiConfig, buildPrompt, spentTodayMicroUsd } from "../ai/remark";
import type { Db } from "../db/client";
import { aiUsage, audits, companies } from "../db/schema";
import type { Issue } from "../research/analyze";
import { DEMO_URL, OPT_OUT_LINE, SIGNATURE, hasLegalForm, shortName, type Composed } from "./compose";

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
- Podjetje imenuj tako, kot bi ga človek (»Ime za v mail« iz PODATKOV) ali sploh ne. Nikoli uradnega imena s s.p./d.o.o. ali imena lastnika.
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


/** Models sometimes put real line breaks inside JSON strings; JSON wants \\n there. */
function escapeNewlinesInStrings(s: string): string {
  let out = "";
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inStr && ch === "\\") {
      out += ch + (s[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"') inStr = !inStr;
    out += inStr && ch === "\n" ? "\\n" : inStr && ch === "\r" ? "" : ch;
  }
  return out;
}

/**
 * Reads the model's answer leniently (owner 2026-10-20: a paid AI answer was thrown away as "manjka zadeva ali
 * besedilo"). Accepts JSON in a code fence, Slovenian keys (zadeva, besedilo), a nested object, the body as a list of
 * paragraphs, and plain "Zadeva: ..." text without JSON.
 */
export function parseModelEmail(raw: string): { subject?: string; body?: string; ok: boolean; keys: string[] } {
  const text = raw.replace(/```(?:json)?/gi, "").trim();
  const asText = (v: unknown): string | undefined =>
    typeof v === "string" ? v : Array.isArray(v) && v.every((x) => typeof x === "string") ? v.join("\n\n") : undefined;
  const SUBJ = /^(subject|zadeva|naslov|title)$/i;
  const BODY = /^(body|besedilo|text|vsebina|sporocilo|sporočilo|email|e-mail|mail|content|message)$/i;
  const find = (o: unknown, re: RegExp, depth = 0): string | undefined => {
    if (!o || typeof o !== "object" || depth > 3) return undefined;
    for (const [k, v] of Object.entries(o)) if (re.test(k) && asText(v)) return asText(v);
    for (const v of Object.values(o)) {
      const r = find(v, re, depth + 1);
      if (r) return r;
    }
    return undefined;
  };
  const start = text.indexOf("{");
  for (let end = text.lastIndexOf("}"); start >= 0 && end > start; end = text.lastIndexOf("}", end - 1)) {
    for (const span of [text.slice(start, end + 1), escapeNewlinesInStrings(text.slice(start, end + 1))]) {
      try {
        const o = JSON.parse(span) as Record<string, unknown>;
        return { subject: find(o, SUBJ), body: find(o, BODY), ok: true, keys: Object.keys(o) };
      } catch {
        /* try the next form or a shorter span */
      }
    }
  }
  const m = text.match(/^\s*\**(?:zadeva|subject)\**\s*:\s*(.+)\n+([\s\S]+)$/i);
  if (m) return { subject: m[1]!.trim(), body: m[2]!.replace(/^\s*\**(?:besedilo|body)\**\s*:\s*/i, "").trim(), ok: true, keys: [] };
  if (/^Pozdravljeni,/.test(text)) return { body: text, ok: true, keys: [] };
  return { ok: false, keys: [] };
}

const str = { type: "string" };
export const EMAIL_SCHEMA = { type: "object", properties: { subject: str, body: str }, required: ["subject", "body"], additionalProperties: false };
export const BODY_SCHEMA = { type: "object", properties: { body: str }, required: ["body"], additionalProperties: false };

/** Why an answer could not be read, for the log (never the text itself beyond 60 characters). */
const answerInfo = (r: { text: string; stopReason?: string | null }) => `stop=${r.stopReason ?? "?"} len=${r.text.length} starts=${JSON.stringify(r.text.slice(0, 60))}`;

const WORDS = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Tidies the model text and checks it; returns the e-mail or the list of problems. */
export function checkAiEmail(
  raw: string,
  ctx: { group: "A" | "B" | null; rivals: string[]; companyName: string },
): { ok: true; email: Composed } | { ok: false; problems: string[] } {
  const parsed = parseModelEmail(raw);
  if (!parsed.ok) return { ok: false, problems: [raw.trim() ? "ni JSON" : "prazen odgovor"] };
  if (typeof parsed.body !== "string") return { ok: false, problems: [`manjka besedilo (ključi: ${parsed.keys.join(", ") || "ni"})`] };
  // A missing subject is not worth a second paid call: a short personal one from the company name.
  if (typeof parsed.subject !== "string" || !parsed.subject.trim()) parsed.subject = `Spletna stran za ${shortName(ctx.companyName)}`;
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
  if (hasLegalForm(`${subject}\n${body}`)) problems.push("uradno ime s s.p./d.o.o.");
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
        { model: cfg.model, system: systemFor(c.group, c.city), user: user + feedback, maxTokens: 2000, schema: EMAIL_SCHEMA },
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
      console.warn(`[ai-email] check failed: ${checked.problems.join("; ").slice(0, 200)} · ${answerInfo(res)}`);
      feedback = `\n\nPREJŠNJI POSKUS NI USTREZAL PRAVILOM (${checked.problems.join("; ")}). Napiši znova in upoštevaj vsa pravila. Odgovori SAMO z JSON.`;
    } catch (e) {
      console.error("[first_email] AI failed:", e instanceof Error ? e.message.slice(0, 120) : "unknown");
      return { reason: "AI se ni odzval" };
    }
  }
  return { reason: `AI besedilo ni prestalo preverjanja (${lastProblems.join("; ")})` };
}

/*
 * Follow-ups written by AI for each company (owner 2026-10-20: "follow up emaile mi je napisal za 3 stranke, vsi so
 * isti ... zgleda da je robot napisal"). The model sees what we already wrote and what research knows, and writes a
 * short, different message: one new angle, no repeating the first e-mail. Same checks as the first e-mail plus
 * length and "no price"; the CRM adds signature and opt-out. If AI is off or fails, the template is used.
 */

export const FOLLOWUP_SYSTEM = `Si David iz inženirji.si. Pred nekaj dnevi si lastniku malega podjetja poslal PRVI E-MAIL (spodaj). Ni odgovoril. Napiši {WHICH}

Pravila:
- Slovenščina, vikanje, sproščeno in prijazno, kot človek, ki piše med delom. Brez prodajnega pritiska in brez očitkov, da ni odgovoril.
- {LENGTH}
- Začni s »Pozdravljeni,« v svoji vrstici.
- NE ponavljaj prvega e-maila (ne iste opazke, ne iste ponudbe, ne istih stavkov). Ne piši »samo preverjam, ali ste prejeli«, »vračam se na«, »želel sem se samo prepričati«.
- {ANGLE}
- Podjetje imenuj kot človek (»Ime za v mail« iz PODATKOV) ali sploh ne. Nikoli uradnega imena s s.p./d.o.o. ali imena lastnika.
- Uporabi SAMO dejstva iz PODATKOV, nič ne izmišljuj.
- Cene ne omenjaj. Edina dovoljena povezava: ${DEMO_URL}
- PREPOVEDANO: konkurenca, beseda »čist«, superlativi, emoji, dolgi pomišljaj, podpis, P.S., oglati oklepaji.
- {HUMAN}

Odgovori samo z JSON: {"body": "..."}`;

const FU = {
  followup_1: {
    which: "drugo, kratko sporočilo (3. dan).",
    length: "Telo 35-80 besed, 2-3 kratki odstavki.",
    angle:
      "Prinesi ENO novo, konkretno stvar, ki je v prvem mailu ni bilo: drugo opazko iz PODATKOV, ali kaj konkretnega bi na njihovi strani lahko pokazali (npr. cenik, galerija del, naročanje, kar stranke hvalijo), ali preprosto vprašanje. Lahko omeniš, da urejevalnik preizkusijo na povezavi. Zaključi z mehkim povabilom, naj odpišejo.",
    min: 30,
    max: 95,
  },
  followup_2: {
    which: "zadnje, zelo kratko sporočilo (8. dan).",
    length: "Telo 20-55 besed, 1-2 odstavka.",
    angle: "Povej, da je to zadnje sporočilo in da jih ne boš več motil; vrata pusti odprta (če bo stran kdaj aktualna, naj odpišejo). Lahko dodaš en kratek, prijazen osebni stavek iz PODATKOV. Brez povezave.",
    min: 15,
    max: 70,
  },
} as const;

export function followUpSystem(kind: "followup_1" | "followup_2"): string {
  const f = FU[kind];
  return FOLLOWUP_SYSTEM.replace("{WHICH}", f.which).replace("{LENGTH}", f.length).replace("{ANGLE}", f.angle).replace("{HUMAN}", AVOID_PHRASES_RULE);
}

/** Without signature and P.S.: what the prospect read. */
const stripTail = (body: string) => body.split(/\n\n(?:Lp,|P\.S\.)/)[0]!.trim();

export function checkAiFollowUp(
  raw: string,
  ctx: { kind: "followup_1" | "followup_2"; firstBody: string; rivals: string[] },
): { ok: true; body: string } | { ok: false; problems: string[] } {
  const parsed = parseModelEmail(raw);
  if (!parsed.ok) return { ok: false, problems: [raw.trim() ? "ni JSON" : "prazen odgovor"] };
  if (typeof parsed.body !== "string") return { ok: false, problems: [`manjka besedilo (ključi: ${parsed.keys.join(", ") || "ni"})`] };
  let body = parsed.body
    .replace(/\r\n/g, "\n")
    .replace(/[—–]/g, "-")
    .replace(/(https?:\/\/)?(www\.)?inzenirji\.si\/demo\/?/gi, DEMO_URL)
    .trim();
  body = body.replace(/\n+(lp|lep pozdrav|lepo pozdravljeni|s spoštovanjem)[,.]?\s*\n[\s\S]*$/i, "").replace(/\n+P\.?\s?S\.?[\s\S]*$/i, "").trim();
  const f = FU[ctx.kind];
  const problems: string[] = [];
  if (!/^Pozdravljeni,/.test(body)) problems.push("ne začne s »Pozdravljeni,«");
  const words = WORDS(body);
  if (words < f.min || words > f.max) problems.push(`dolžina ${words} besed`);
  if (/(?<!\p{L})(ti|tebi|tvoj\p{L}*|imaš|veš|želiš|boš)(?!\p{L})/iu.test(body)) problems.push("tikanje");
  if (/čist/i.test(body)) problems.push("beseda »čist«");
  for (const p of aiPhrases(body)) problems.push(`AI fraza »${p}«`);
  if (/samo (kratko )?preverjam|ali ste prejeli|vračam se na/i.test(body)) problems.push("fraza »preverjam, ali ste prejeli«");
  if (/€|\beur\b/i.test(body)) problems.push("cena");
  if (/konkurenc|wordpress/i.test(body)) problems.push("konkurenca ali WordPress");
  for (const r of ctx.rivals) if (r && r.length > 3 && body.toLowerCase().includes(r.toLowerCase())) problems.push(`omenja ${r}`);
  if (hasLegalForm(body)) problems.push("uradno ime s s.p./d.o.o.");
  if (/\[|\]/.test(body)) problems.push("oglati oklepaji");
  if ((body.match(/https?:\/\/\S+/g) ?? []).some((l) => !l.startsWith(DEMO_URL))) problems.push("tuja povezava");
  if (ctx.kind === "followup_2" && /https?:\/\//.test(body)) problems.push("povezava v zadnjem sporočilu");
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(body)) problems.push("e-naslov v besedilu");
  // Must not reuse whole sentences of the first e-mail.
  const firstSentences = stripTail(ctx.firstBody)
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 40);
  if (firstSentences.some((x) => body.toLowerCase().includes(x))) problems.push("ponavlja stavek iz prvega maila");
  if (problems.length) return { ok: false, problems };
  return { ok: true, body: [body, SIGNATURE, OPT_OUT_LINE].join("\n\n") };
}

/** The AI follow-up body for a company, or the reason it is not available (the caller uses the template). */
export async function aiFollowUp(
  db: Db,
  input: { companyId: string; kind: "followup_1" | "followup_2"; firstBody: string; rivals: string[] },
  cfg: AiConfig | null,
  now = new Date(),
): Promise<{ body: string; model: string } | { reason: string }> {
  if (!cfg) return { reason: "AI je izklopljen (ključ ali dnevni AI proračun v Nastavitvah)" };
  const [c] = await db.select().from(companies).where(eq(companies.id, input.companyId)).limit(1);
  const [audit] = await db.select().from(audits).where(eq(audits.companyId, input.companyId)).orderBy(desc(audits.createdAt)).limit(1);
  if (!c) return { reason: "podjetja ni" };
  const data = buildPrompt(c, (audit?.issues ?? []) as Issue[], (audit?.data ?? {}) as Parameters<typeof buildPrompt>[2]);
  const user = `${data}\n\nPRVI E-MAIL (že poslan)\n${stripTail(input.firstBody)}`;
  let feedback = "";
  let lastProblems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    if ((await spentTodayMicroUsd(db, now)) >= cfg.dailyBudgetMicroUsd) return { reason: "dnevni AI proračun je porabljen" };
    try {
      const res = await callClaude(
        { model: cfg.model, system: followUpSystem(input.kind), user: user + feedback, maxTokens: 1500, schema: BODY_SCHEMA },
        { apiKey: cfg.apiKey, fetchImpl: cfg.fetchImpl, timeoutMs: 60_000 },
      );
      const checked = checkAiFollowUp(res.text, { kind: input.kind, firstBody: input.firstBody, rivals: input.rivals });
      await db.insert(aiUsage).values({
        job: "followup",
        model: cfg.model,
        companyId: input.companyId,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        costMicroUsd: res.costMicroUsd,
        ok: checked.ok,
      });
      if (checked.ok) return { body: checked.body, model: cfg.model };
      lastProblems = checked.problems;
      console.warn(`[followup] check failed: ${checked.problems.join("; ").slice(0, 200)} · ${answerInfo(res)}`);
      console.warn(`[ai-email] check failed: ${checked.problems.join("; ").slice(0, 200)} · ${answerInfo(res)}`);
      feedback = `\n\nPREJŠNJI POSKUS NI USTREZAL PRAVILOM (${checked.problems.join("; ")}). Napiši znova in upoštevaj vsa pravila. Odgovori SAMO z JSON.`;
    } catch (e) {
      console.error("[followup] AI failed:", e instanceof Error ? e.message.slice(0, 120) : "unknown");
      return { reason: "AI se ni odzval" };
    }
  }
  return { reason: `AI besedilo ni prestalo preverjanja (${lastProblems.join("; ")})` };
}
