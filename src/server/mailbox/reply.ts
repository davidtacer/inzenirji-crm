import { and, desc, eq, inArray } from "drizzle-orm";
import { AVOID_PHRASES_RULE } from "../ai/humanize";
import type { Db } from "../db/client";
import { aiUsage, companies, deals, drafts } from "../db/schema";
import { callClaude, AiError } from "../ai/anthropic";
import type { AiConfig } from "../ai/remark";
import { ownText, type InboundMail, type ReplyClass } from "./classify";
import type { Settings } from "../settings";

/*
 * Reply drafts (TASK-009, made contextual in TASK-027 / ADR-025). Claude reads our last e-mail and their answer and
 * replies to what they actually wrote, always ending with ONE concrete next step from the contact options below
 * (booking link, the owner's phone, or asking for their number). Offer facts never include a migration price
 * (ADR-009). Without AI or when the answer breaks the rules → templates that also use the contact options.
 */

export const ANSWER_PLACEHOLDER = "[TUKAJ ODGOVORI NA VPRAŠANJE]";
const SIGNATURE = "Lp,\nDavid\ninženirji.si";

const subjectRe = (s: string) => (/^\s*re:/i.test(s) ? s.trim() : `Re: ${s.trim()}`);

export type ContactOptions = { bookingUrl: string | null; phone: string | null };

export function contactOptions(st: Pick<Settings, "bookingUrl" | "ownerPhone">): ContactOptions {
  return { bookingUrl: st.bookingUrl.trim() || null, phone: st.ownerPhone.trim() || null };
}

/** The concrete next step, in priority: booking link, then phone + "send me yours", then ask for their number. */
export function nextStep(o: ContactOptions): string {
  if (o.bookingUrl && o.phone) return `Termin si lahko izberete kar sami tukaj: ${o.bookingUrl} - ali pa me pokličite na ${o.phone}.`;
  if (o.bookingUrl) return `Termin si lahko izberete kar sami tukaj: ${o.bookingUrl}`;
  if (o.phone) return `Pokličite me na ${o.phone} ali mi pošljite svojo številko in vas pokličem jaz.`;
  return "Pošljite mi svojo telefonsko številko in kdaj vam najbolj ustreza, pa vas pokličem.";
}

const OFFER = `Ponudba inženirji.si (Maribor):
- Skupina B (nova stran): 590 € + DDV, enkratno, stran je na spletu v 7 dneh od prejema vseh materialov (besedila, slike, logotip, kontakti). Če ni v 7 dneh, vrnemo predplačilo. Plačilo 50 % ob naročilu, 50 % ob objavi.
- Skupina A (prenos obstoječe strani na našo platformo z urejevalnikom): cena je individualna, določimo jo po pregledu strani. NIKOLI ne navajaj cene za prenos.
- Urejevalnik: stranka stran ureja sama s pisanjem sporočil (kot klepet), npr. sprememba cen, besedila, slik.
- Strani so hitre, prilagojene telefonom in optimizirane za Google in AI iskalnike (ChatGPT).`;

function system(o: ContactOptions) {
  return `Si David iz inženirji.si. Pišeš odgovor potencialni stranki, ki je odgovorila na tvoj e-mail. Slovenščina, vikanje, prijazno in kratko (največ 100 besed).
Pravila:
- Odgovori točno na to, kar so napisali. Če so že predlagali klic, sestanek ali vprašali, kdaj, jih NE sprašuj nazaj "kdaj vam ustreza" - takoj ponudi naslednji korak spodaj.
- Če kaj vprašajo, odgovori samo z dejstvi iz PONUDBE. Česar ne veš, ne izmišljuj - reci, da to razloživa na kratkem klicu.
- Ne predlagaj konkretnih ur ali dni (ne poznaš Davidovega koledarja).
- Konec sporočila mora vsebovati TOČNO ta naslednji korak (lahko ga malo preoblikuješ, povezavo in številko pa prepiši natančno):
  "${nextStep(o)}"
- Če stranka reče "zdaj ne", se zahvali, ne prepričuj in povej, da se oglasiš čez nekaj mesecev; naslednjega koraka takrat NE dodaj.
- Navaden vezaj (-), brez dolgega pomišljaja. Začni z "Pozdravljeni,". Brez podpisa (dodam ga sam).
- ${AVOID_PHRASES_RULE}
${OFFER}
Odgovori samo z besedilom e-maila.`;
}

function templateReply(cls: ReplyClass, o: ContactOptions): string | null {
  if (cls === "interested") return `Pozdravljeni,\n\nhvala za odgovor, me veseli!\n\nPredlagam kratek, 15-minutni klic, da vidim, kaj potrebujete, nato vam pripravim konkreten predlog. ${nextStep(o)}\n\n${SIGNATURE}`;
  if (cls === "not_now") return `Pozdravljeni,\n\nrazumem, hvala za odgovor. Oglasim se čez nekaj mesecev - če bo prej aktualno, mi samo odpišite na ta e-mail.\n\n${SIGNATURE}`;
  if (cls === "question") return `Pozdravljeni,\n\nhvala za vprašanje.\n\n${ANSWER_PLACEHOLDER}\n\n${nextStep(o)}\n\n${SIGNATURE}`;
  return null;
}

/** Checks a model answer; returns the body without signature or null. */
export function cleanReply(text: string, cls: ReplyClass, group: "A" | "B" | null, o: ContactOptions): string | null {
  let body = text.trim().replace(/[—–]/g, "-");
  if (!body.startsWith("Pozdravljeni")) return null;
  if (body.split(/\s+/).length > 150) return null;
  if (group !== "B" && /€|eur\b/i.test(body)) return null; // ADR-009: no price unless it is a new-site lead
  body = body.replace(/\n+\s*(Lp|Lep pozdrav|LP|S spoštovanjem)[,.!]?[\s\S]*$/i, "").trim();
  if (cls !== "not_now") {
    if (o.bookingUrl && !body.includes(o.bookingUrl)) return null;
    if (o.phone && !o.bookingUrl && !body.replace(/\s/g, "").includes(o.phone.replace(/\s/g, ""))) return null;
  }
  return body;
}

async function lastSentToThem(db: Db, companyId: string, inReplyTo: string | null) {
  const where = and(eq(deals.companyId, companyId), eq(drafts.status, "sent"));
  const rows = await db
    .select({ body: drafts.body, messageId: drafts.messageId })
    .from(drafts)
    .innerJoin(deals, eq(deals.id, drafts.dealId))
    .where(inReplyTo ? and(where, inArray(drafts.messageId, [inReplyTo])) : where)
    .orderBy(desc(drafts.sentAt))
    .limit(1);
  if (rows[0] || !inReplyTo) return rows[0]?.body ?? null;
  return lastSentToThem(db, companyId, null);
}

export async function composeReply(
  db: Db,
  companyId: string,
  m: InboundMail,
  cls: ReplyClass,
  ai: AiConfig | null,
  contact: ContactOptions = { bookingUrl: null, phone: null },
): Promise<{ subject: string; body: string } | null> {
  const subject = subjectRe(m.subject || "Spletna stran");
  const template = templateReply(cls, contact);
  if (!template) return null;
  if (ai) {
    const [c] = await db.select({ name: companies.name, group: companies.group }).from(companies).where(eq(companies.id, companyId)).limit(1);
    const ours = await lastSentToThem(db, companyId, m.inReplyTo);
    try {
      const r = await callClaude(
        {
          model: ai.model,
          system: system(contact),
          user: [
            `Podjetje: ${c?.name ?? ""} (skupina ${c?.group ?? "?"})`,
            `Razvrstitev odgovora: ${cls}`,
            ours ? `\nTvoj zadnji e-mail njim:\n${ours.slice(0, 2000)}` : "",
            `\nNjihov odgovor (zadeva: ${m.subject}):\n${ownText(m.text).slice(0, 3000)}`,
          ].join("\n"),
          maxTokens: 1500,
        },
        { apiKey: ai.apiKey, fetchImpl: ai.fetchImpl },
      );
      const body = cleanReply(r.text, cls, c?.group ?? null, contact);
      await db.insert(aiUsage).values({ job: "reply", model: ai.model, companyId, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costMicroUsd: r.costMicroUsd, ok: !!body });
      if (body) return { subject, body: `${body}\n\n${SIGNATURE}` };
    } catch (e) {
      if (!(e instanceof AiError || (e instanceof Error && e.name === "AbortError"))) throw e;
    }
  }
  return { subject, body: template };
}
