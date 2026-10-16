import type { Issue } from "../research/analyze";

/*
 * Outreach texts (TASK-008, ADR-018 scoring feeds the order, ADR-013 sender).
 * Written in the first person as David, short (< 150 words), one concrete remark from the audit,
 * plain hyphens (owner's style guide `email_predloga.md`). No migration price (ADR-009), no mockup
 * mention (ADR-005 — the owner attaches one by hand when he made it), opt-out in every e-mail (ADR-007).
 */

export const EDITOR_URL = "https://www.inzenirji.si/urejevalnik";
export const SITE_URL = "https://www.inzenirji.si";
/** Public editor demo (ADR-015); the landing redirects /demo to it. */
export const DEMO_URL = "https://www.inzenirji.si/demo";
/** Our flagship: the owner edits his site by chatting with the AI editor (owner, 2026-10-16). */
export const EDITOR_LINE = `Največja prednost: stran potem urejate sami, s pogovorom. Napišete, kaj želite spremeniti, ali pošljete sliko, in AI urejevalnik to uredi v nekaj sekundah. Preizkusite ga kar sami: ${DEMO_URL}`;
export const OPT_OUT_LINE = "P.S. Če vas to ne zanima, mi samo odpišite »ne« in vam ne bom več pisal.";

export type ComposeInput = {
  name: string;
  city: string | null;
  group: "A" | "B" | null;
  websiteDomain: string | null;
  ratingX10: number | null;
  reviewCount: number | null;
  issues: Issue[];
  /** Nearest competitor that has its own site (name + distance in metres), if any. */
  rival?: { name: string; distanceM: number | null } | null;
  /** AI-written remark (TASK-024); used instead of the rule-based one when present. */
  aiRemark?: string | null;
};

export type Composed = { subject: string; body: string };

const SOCIAL_NAME: [RegExp, string][] = [
  [/facebook|fb\./, "Facebooku"],
  [/instagram/, "Instagramu"],
  [/tiktok/, "TikToku"],
];

function rating(x10: number) {
  return (x10 / 10).toFixed(1).replace(".", ",");
}

/** One sentence fragment that follows "opazil sem, da …". */
export function remarkFor(input: ComposeInput): string {
  // Older AI remarks may start with "da" ("opazil sem, da da …").
  if (input.aiRemark) return input.aiRemark.trim().replace(/^da\s+/i, "");
  const top = input.issues[0];
  const goodReviews = (input.ratingX10 ?? 0) >= 45 && (input.reviewCount ?? 0) >= 30;
  const praise = goodReviews ? ` - škoda, ker imate na Googlu odlične ocene (${rating(input.ratingX10!)} iz ${input.reviewCount} mnenj)` : "";
  if (!top) return goodReviews ? `imate na Googlu odlične ocene (${rating(input.ratingX10!)} iz ${input.reviewCount} mnenj), spletna stran pa tega ne pokaže v pravi luči` : "bi vaša spletna stran lahko delala bolje za vas";
  const all = input.issues.map((i) => i.code);
  switch (top.code) {
    case "no_website":
      return `nimate spletne strani${praise}`;
    case "social_only": {
      const where = SOCIAL_NAME.find(([re]) => re.test(input.websiteDomain ?? ""))?.[1] ?? "družbenih omrežjih";
      return `se predstavljate samo na ${where}, lastne spletne strani pa nimate${praise}`;
    }
    case "link_only":
      return `namesto spletne strani uporabljate samo stran s povezavami${praise}`;
    case "unreachable":
      return `se vaša spletna stran${input.websiteDomain ? ` ${input.websiteDomain}` : ""} trenutno ne odpre`;
    case "not_mobile":
      return `vaša spletna stran ni prilagojena za telefone - večina obiskovalcev pa danes pride prav s telefona${praise}`;
    case "old_year": {
      const year = top.text.match(/\d{4}/)?.[0];
      const cms = input.issues.find((i) => i.code === "cms")?.text.match(/sistemu (.+)\.$/)?.[1];
      return `je v nogi vaše spletne strani še letnica ${year}${cms ? `, stran pa teče na ${cms}` : ""}${praise}`;
    }
    case "slow": {
      const s = top.text.match(/(\d+,\d) s/)?.[1];
      return `se vaša spletna stran nalaga ${s} s - marsikdo na telefonu prej zapre stran${all.includes("not_mobile") ? "" : praise}`;
    }
    case "hours_mismatch":
      return `${top.text.replace(/^Na strani/, "na vaši spletni strani").replace(/\.$/, "")} - stranke ne vedo, kaj velja`;
    case "phone_mismatch":
      return "je telefonska številka na vaši spletni strani drugačna kot na Google profilu - stranke ne vedo, katera velja";
    case "no_https":
      return "vaša spletna stran ne uporablja varne povezave (HTTPS), zato jo brskalniki označijo kot »ni varno«";
    case "cms": {
      const cms = top.text.match(/sistemu (.+)\.$/)?.[1];
      return `vaša spletna stran teče na ${cms}${praise}`;
    }
    case "no_structured_data":
      return `vaše spletne strani Google in ChatGPT ne »prebereta« dobro, ker nima strukturiranih podatkov${praise}`;
    case "no_description":
      return "vaša spletna stran nima opisa za Google, zato se v iskanju prikaže naključen odlomek";
    case "no_h1":
      return "vaša spletna stran nima glavnega naslova, po katerem jo Google prepozna";
    default:
      return top.text.charAt(0).toLowerCase() + top.text.slice(1).replace(/\.$/, "");
  }
}

function distance(m: number | null) {
  if (m === null) return "v vaši bližini";
  if (m < 1000) return `${Math.max(50, Math.round(m / 50) * 50)} m od vas`;
  return `${(m / 1000).toFixed(1).replace(".", ",")} km od vas`;
}

function closing(city: string | null) {
  return /maribor/i.test(city ?? "")
    ? "Če vas to zanima, mi na kratko odpišite. Ker smo v Mariboru, se lahko tudi vsedemo za 15 min na kavo in predebatiramo. Javite, kako se vam zdi."
    : "Če vas to zanima, mi na kratko odpišite, pa se za 15 min slišimo po telefonu in predebatiramo. Javite, kako se vam zdi.";
}

const SIGNATURE = "Lp,\nDavid\ninženirji.si";

export function composeFirst(input: ComposeInput): Composed {
  const weakOnline = ["no_website", "social_only", "link_only", "unreachable"].includes(input.issues[0]?.code ?? "");
  const rivalLine =
    input.rival && weakOnline
      ? `\n\n${input.rival.name}, ${distance(input.rival.distanceM)}, ima svojo spletno stran - ko ljudje na telefonu iščejo, kam iti, primerjajo prav to.`
      : "";
  const offer =
    input.group === "B"
      ? `Novo stran vam naredimo za 590 € + DDV in je na spletu v 7 dneh od prejema vseh materialov.\n\n${EDITOR_LINE}`
      : `Vašo obstoječo vsebino prenesemo na našo platformo, kjer potem stran urejate sami, s pogovorom. Napišete, kaj želite spremeniti, ali pošljete sliko, in AI urejevalnik to uredi v nekaj sekundah. Preizkusite ga kar sami: ${DEMO_URL}`;
  const body = [
    "Pozdravljeni,",
    `opazil sem, da ${remarkFor(input)}.${rivalLine}`,
    `Sem David iz ekipe inženirji.si (${SITE_URL}) - delamo hitre in čiste spletne strani, prilagojene za telefone in optimizirane tudi za ChatGPT in ostale AI iskalnike, ne samo Google.`,
    offer,
    closing(input.city),
    SIGNATURE,
    OPT_OUT_LINE,
  ].join("\n\n");
  return { subject: `Spletna stran za ${input.name}`, body };
}

/** Day 3: short, with one new fact (the second issue) when there is one. */
export function composeFollowUp1(input: ComposeInput, firstSubject: string): Composed {
  const second = input.issues[1] ? remarkFor({ ...input, issues: input.issues.slice(1), ratingX10: null }) : null;
  const body = [
    "Pozdravljeni,",
    `samo kratko preverjam, ali ste prejeli moje sporočilo glede spletne strani za ${input.name}.${second ? ` Ob ponovnem pogledu sem opazil še, da ${second}.` : ""}`,
    `Če vas zanima, kako bi stran urejali sami s pogovorom, urejevalnik lahko preizkusite kar zdaj: ${DEMO_URL}`,
    "Če vas zanima, mi odpišite in se dogovoriva za kratek pogovor - brez obveznosti.",
    SIGNATURE,
    OPT_OUT_LINE,
  ].join("\n\n");
  return { subject: `Re: ${firstSubject}`, body };
}

/** Day 8: the last one, "I'll close the folder". */
export function composeFollowUp2(input: ComposeInput, firstSubject: string): Composed {
  const body = [
    "Pozdravljeni,",
    `to je moje zadnje sporočilo glede spletne strani za ${input.name} - ne bi vas rad motil.`,
    "Če bo prenova strani kdaj aktualna, mi samo odpišite na ta e-mail in se oglasim.",
    SIGNATURE,
    OPT_OUT_LINE,
  ].join("\n\n");
  return { subject: `Re: ${firstSubject}`, body };
}

/** Plain text → simple HTML: paragraphs, line breaks, our links with friendly text. */
export function toHtml(body: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const linked = (s: string) =>
    esc(s)
      .replace(/https:\/\/www\.inzenirji\.si\/urejevalnik/g, '<a href="https://www.inzenirji.si/urejevalnik">inzenirji.si/urejevalnik</a>')
      .replace(/https:\/\/www\.inzenirji\.si\/demo/g, '<a href="https://www.inzenirji.si/demo">inzenirji.si/demo</a>')
      .replace(/\(https:\/\/www\.inzenirji\.si\)/g, "")
      .replace(/inženirji\.si(?![^<]*<\/a>)/g, '<a href="https://www.inzenirji.si">inženirji.si</a>');
  return `<div>${body
    .split(/\n{2,}/)
    .map((p) => linked(p).replace(/\n/g, "<br>"))
    .join("<br><br>")}</div>`;
}

/** Text version keeps the full URL of the site so it stays clickable in plain-text clients. */
export function toText(body: string): string {
  return body;
}
