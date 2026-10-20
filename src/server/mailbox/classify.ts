import type { AiConfig } from "../ai/remark";
import { AiError, callClaude } from "../ai/anthropic";

/*
 * Reply classification (TASK-009, spec §5.5). Clear cases by rules (free, certain); the rest by Claude Haiku;
 * when AI is off or fails → "question", so the owner always looks at it.
 */

export type ReplyClass = "interested" | "not_now" | "no" | "question" | "out_of_office" | "bounce";

export type InboundMail = {
  messageId: string;
  from: string;
  /** To + Cc addresses (used to match mail the owner sent from his own mail program). */
  to?: string[];
  subject: string;
  text: string;
  date: Date;
  inReplyTo: string | null;
  references: string[];
  autoSubmitted: string | null;
};

const BOUNCE_FROM = /^(mailer-daemon|postmaster|mail-daemon)@/i;
const BOUNCE_SUBJECT = /undeliver|delivery status notification|delivery failure|returned mail|mail delivery failed|nedostavljen|failure notice/i;
const OOO_SUBJECT = /out of (the )?office|automatic reply|auto(matic)?[- ]?reply|autoreply|samodejni odgovor|odsoten|odsotnost|dopust|na dopustu|abwesenheit/i;
const NO_TEXT = /^\s*(ne|no|nein)\s*[.!]?\s*$|^\s*(ne,? hvala|ne zanima|nas ne zanima|ni interesa|odjava|odjavite|odjavi|unsubscribe|ne pošiljajte|ne pišite)/i;

/** First lines the person actually wrote (quoted history and signature-less tail removed). */
export function ownText(text: string): string {
  const lines: string[] = [];
  for (const line of text.replace(/\r/g, "").split("\n")) {
    if (/^>/.test(line)) break;
    if (/^(On|Dne|V|Am)\s.+(wrote|napisal|je napisal|je pisal|schrieb)/i.test(line)) break;
    if (/^-{2,}\s*(Original Message|Izvirno sporočilo|Prvotno sporočilo)/i.test(line)) break;
    if (/^(From|Od|Von):\s/i.test(line) && lines.length) break;
    lines.push(line);
  }
  return lines.join("\n").trim();
}

export function classifyByRules(m: InboundMail): ReplyClass | null {
  if (BOUNCE_FROM.test(m.from) || BOUNCE_SUBJECT.test(m.subject)) return "bounce";
  if ((m.autoSubmitted && m.autoSubmitted !== "no") || OOO_SUBJECT.test(m.subject)) return "out_of_office";
  if (/^\s*odjava\s*$/i.test(m.subject) || NO_TEXT.test(ownText(m.text))) return "no";
  return null;
}

const SYSTEM = `Razvrsti odgovor potencialne stranke na naš prodajni e-mail (izdelava spletnih strani).
Kategorije:
- interested: želi več informacij, klic, ponudbo, sestanek ali se strinja.
- not_now: zdaj ne, morda kasneje (npr. "javim se jeseni", "trenutno ne").
- no: ne želi, naj ne pišemo več, ima že izvajalca in ne želi sprememb.
- question: postavi vprašanje, a se še ni odločil (cena, rok, kako deluje).
Odgovori samo z JSON: {"class": "interested|not_now|no|question"}`;

export async function classifyReply(m: InboundMail, ai: AiConfig | null): Promise<{ cls: ReplyClass; by: string; costMicroUsd: number; inputTokens: number; outputTokens: number }> {
  const rule = classifyByRules(m);
  if (rule) return { cls: rule, by: "rule", costMicroUsd: 0, inputTokens: 0, outputTokens: 0 };
  if (!ai) return { cls: "question", by: "default", costMicroUsd: 0, inputTokens: 0, outputTokens: 0 };
  const model = "claude-haiku-5-5";
  try {
    const r = await callClaude(
      { model, system: SYSTEM, user: `Zadeva: ${m.subject}\n\n${ownText(m.text).slice(0, 3000)}`, maxTokens: 300, schema: { type: "object", properties: { class: { type: "string", enum: ["interested", "not_now", "no", "question"] } }, required: ["class"], additionalProperties: false } },
      { apiKey: ai.apiKey, fetchImpl: ai.fetchImpl },
    );
    const cls = r.text.match(/"class"\s*:\s*"(interested|not_now|no|question)"/)?.[1] as ReplyClass | undefined;
    return { cls: cls ?? "question", by: cls ? model : "default", costMicroUsd: r.costMicroUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens };
  } catch (e) {
    if (e instanceof AiError || (e instanceof Error && e.name === "AbortError")) return { cls: "question", by: "default", costMicroUsd: 0, inputTokens: 0, outputTokens: 0 };
    throw e;
  }
}
