import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { companies } from "../db/schema";
import { callClaude, AiError } from "../ai/anthropic";
import type { AiConfig } from "../ai/remark";
import { ownText, type InboundMail, type ReplyClass } from "./classify";

/*
 * Reply drafts (TASK-009). Templates for interested / not now; for questions Claude drafts an answer from the
 * offer facts below (never a migration price, ADR-009); without AI the draft contains a placeholder the owner
 * must replace before approving.
 */

export const ANSWER_PLACEHOLDER = "[TUKAJ ODGOVORI NA VPRAŠANJE]";
const SIGNATURE = "Lp,\nDavid\ninženirji.si";

const subjectRe = (s: string) => (/^\s*re:/i.test(s) ? s.trim() : `Re: ${s.trim()}`);

function booking(env: Record<string, string | undefined>) {
  return env.BOOKING_URL ? ` Termin si lahko izberete tudi sami tukaj: ${env.BOOKING_URL}` : "";
}

const OFFER = `Ponudba inženirji.si (Maribor):
- Skupina B (nova stran): 590 € + DDV, enkratno, stran je na spletu v 7 dneh od prejema vseh materialov (besedila, slike, logotip, kontakti). Če ni v 7 dneh, vrnemo predplačilo. Plačilo 50 % ob naročilu, 50 % ob objavi.
- Skupina A (prenos obstoječe strani na našo platformo z urejevalnikom): cena je individualna, določimo jo po pregledu strani. NIKOLI ne navajaj cene za prenos.
- Urejevalnik: stranko stran ureja sama s pisanjem sporočil (kot klepet), npr. sprememba cen, besedila, slik.
- Strani so hitre, prilagojene telefonom in optimizirane za Google in AI iskalnike (ChatGPT).`;

const SYSTEM = `Si David iz inženirji.si. Napiši kratek, prijazen odgovor (vikanje, slovenščina, največ 120 besed) na vprašanje potencialne stranke.
Uporabi samo spodnja dejstva; česar ne veš, ne izmišljuj - raje predlagaj kratek klic. Na koncu predlagaj 15-minutni klic.
Navaden vezaj (-), brez dolgega pomišljaja. Brez pozdrava na koncu in brez podpisa (dodam ga sam). Začni z "Pozdravljeni,".
${OFFER}
Odgovori samo z besedilom e-maila.`;

export async function composeReply(
  db: Db,
  companyId: string,
  m: InboundMail,
  cls: ReplyClass,
  ai: AiConfig | null,
  env: Record<string, string | undefined> = process.env,
): Promise<{ subject: string; body: string } | null> {
  const subject = subjectRe(m.subject || "Spletna stran");
  if (cls === "interested") {
    return {
      subject,
      body: `Pozdravljeni,\n\nhvala za odgovor, me veseli!\n\nPredlagam kratek, 15-minutni klic, da vidim, kaj potrebujete, nato vam pripravim konkreten predlog. Kdaj vam ta teden ustreza?${booking(env)}\n\n${SIGNATURE}`,
    };
  }
  if (cls === "not_now") {
    return { subject, body: `Pozdravljeni,\n\nrazumem, hvala za odgovor. Oglasim se čez nekaj mesecev - če bo prej aktualno, mi samo odpišite na ta e-mail.\n\n${SIGNATURE}` };
  }
  if (cls !== "question") return null;
  const [c] = await db.select({ name: companies.name, group: companies.group }).from(companies).where(eq(companies.id, companyId)).limit(1);
  if (ai) {
    try {
      const r = await callClaude(
        {
          model: ai.model,
          system: SYSTEM,
          user: `Podjetje: ${c?.name ?? ""} (skupina ${c?.group ?? "?"})\nZadeva: ${m.subject}\n\nNjihovo sporočilo:\n${ownText(m.text).slice(0, 3000)}`,
          maxTokens: 500,
        },
        { apiKey: ai.apiKey, fetchImpl: ai.fetchImpl },
      );
      let body = r.text.trim().replace(/[—–]/g, "-");
      const words = body.split(/\s+/).length;
      const priceForA = c?.group === "A" && /€|eur\b/i.test(body);
      if (body.startsWith("Pozdravljeni") && words <= 170 && !priceForA) {
        body = body.replace(/\n*(Lp|Lep pozdrav|LP)[,.]?[\s\S]*$/i, "");
        return { subject, body: `${body}${booking(env) ? `\n\n${booking(env).trim()}` : ""}\n\n${SIGNATURE}` };
      }
    } catch (e) {
      if (!(e instanceof AiError || (e instanceof Error && e.name === "AbortError"))) throw e;
    }
  }
  return { subject, body: `Pozdravljeni,\n\nhvala za vprašanje.\n\n${ANSWER_PLACEHOLDER}\n\nČe vam ustreza, se lahko tudi slišimo za 15 min po telefonu.\n\n${SIGNATURE}` };
}
