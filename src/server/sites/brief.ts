
/*
 * BRIEF.md, CLAUDE.md client section and the kickoff prompt (TASK-039 §2). The brief is built ONLY from `BriefInput`,
 * a type that has no field for score, price strategy, owner-private notes, e-mail drafts or do-not-contact data; the
 * loader fills it from an explicit column list. A field that is not in the type cannot leak (ADR-056).
 */

export type BriefInput = {
  siteId: string;
  kind: "client" | "migration" | "own";
  generatedAt: string;
  version: number;
  company: { name: string; category: string | null; address: string | null; city: string | null; phone: string | null; website: string | null };
  domain: string | null;
  currentUrl: string | null;
  contact: string | null;
  contacts: { name: string | null; email: string | null; phone: string | null; role: string | null }[];
  languages: string[];
  features: string | null;
  priceCents: number | null;
  deadline: string | null;
  hasCgp: boolean;
  notes: string | null;
  /** Findings of the research (our own analysis of the old site / Google profile). */
  issues: string[];
  researchSummary: string | null;
  competitors: { name: string; website: string | null; city: string | null }[];
  call: { summary: string; scope: string; wishes: string[]; objections: string[]; nextStep: string } | null;
  materials: { label: string; done: boolean }[];
  assets: { name: string; source: string }[];
  editors: { email: string; role: string }[];
  ga4: string | null;
};

const KIND: Record<BriefInput["kind"], string> = {
  client: "Stranka (plačljiva stran)",
  migration: "Selitev obstoječe strani",
  own: "Naša lastna stran",
};
const eur = (c: number) => new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR" }).format(c / 100);
const list = (xs: string[], empty = "—") => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : empty);
const line = (k: string, v: string | null | undefined) => (v && v.trim() ? `- **${k}:** ${v.trim()}` : null);
const lines = (...xs: (string | null)[]) => xs.filter((x): x is string => !!x).join("\n") || "—";

export function buildBrief(i: BriefInput): string {
  const c = i.company;
  const missing = i.materials.filter((m) => !m.done).map((m) => m.label);
  const out = [
    `# BRIEF — ${c.name}`,
    "",
    `> Posnetek iz CRM-ja (verzija ${i.version}, ${i.generatedAt}). Vir resnice je CRM; tega dela ne popravljaj ročno.`,
    `> Če dejstvo manjka ali dvomiš, vprašaj lastnika (Davida), ne ugibaj.`,
    "",
    "## Projekt",
    lines(line("Vrsta", KIND[i.kind]), line("ID strani", i.siteId), line("Domena", i.domain), line("Trenutna stran", i.currentUrl), line("Jeziki", i.languages.join(", ")), line("Obstoječ CGP", i.hasCgp ? "da (v mapi brief/assets ali v repozitoriju stranke)" : "ne, naredimo ga mi"), line("Rok", i.deadline), line("Dogovorjena cena", i.priceCents !== null ? eur(i.priceCents) : null)),
    "",
    "## Podjetje",
    lines(line("Ime", c.name), line("Dejavnost", c.category), line("Naslov", [c.address, c.city].filter(Boolean).join(", ")), line("Telefon", c.phone), line("Trenutna spletna stran", c.website)),
    "",
    "## Kontakt pri stranki",
    i.contact ? i.contact : "—",
    i.contacts.length ? `\n${list(i.contacts.map((p) => [p.name, p.role, p.email, p.phone].filter(Boolean).join(" · ")))}` : "",
    "",
    "## Obseg in posebnosti",
    i.features?.trim() || "—",
    "",
    "## Opombe za agenta",
    i.notes?.trim() || "—",
    "",
    "## Kaj smo ugotovili (naša analiza)",
    i.researchSummary?.trim() || "—",
    "",
    "Težave obstoječe prisotnosti:",
    list(i.issues),
    "",
    "## Konkurenca v bližini",
    list(i.competitors.map((x) => [x.name, x.city, x.website].filter(Boolean).join(" · "))),
    "",
    "## Pogovor s stranko",
    i.call
      ? [i.call.summary, "", `Obseg: ${i.call.scope || "—"}`, "", "Želje:", list(i.call.wishes), "", "Pomisleki:", list(i.call.objections), "", `Dogovorjeni naslednji korak: ${i.call.nextStep || "—"}`].join("\n")
      : "—",
    "",
    "## Materiali",
    i.materials.length ? `Prejeto:\n${list(i.materials.filter((m) => m.done).map((m) => m.label))}\n\nManjka:\n${list(missing)}` : "—",
    "",
    "Datoteke v `brief/assets/` (glej `brief/assets/INDEX.md`):",
    list(i.assets.map((a) => `${a.name} (${a.source})`)),
    "",
    "## Domena, urejevalnik, analitika",
    lines(line("Uredniki (e-pošta, vloga)", i.editors.map((e) => `${e.email} (${e.role})`).join(", ")), line("GA4", i.ga4 ?? "še ni ustvarjen; merilni ID vpiše lastnik v content/site.json")),
    "",
  ];
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

const START = "<!-- CLIENT:START (CRM) -->";
const END = "<!-- CLIENT:END -->";

/** Adds or replaces the client section of the template CLAUDE.md. */
export function fillClaudeMd(template: string, i: Pick<BriefInput, "siteId" | "kind" | "languages"> & { company: { name: string }; domain: string | null }): string {
  const block = [
    START,
    "## Client",
    "",
    `- Client: ${i.company.name}`,
    `- Kind: ${i.kind} · site id \`${i.siteId}\``,
    `- Domain: ${i.domain ?? "not decided yet"}`,
    `- Languages: ${i.languages.join(", ")}`,
    "- Facts, tone and materials: `BRIEF.md` and `brief/assets/` (written by the CRM; do not edit by hand).",
    "- Report progress with the MCP tool `save_project_status` (you may move up to `design_draft`; the owner approves the design).",
    END,
  ].join("\n");
  const re = new RegExp(`${START.replace(/[()]/g, "\\$&")}[\\s\\S]*?${END}`);
  if (re.test(template)) return template.replace(re, block);
  const marker = "\n## Architecture in one minute";
  return template.includes(marker) ? template.replace(marker, `\n${block}\n${marker}`) : `${template.trimEnd()}\n\n${block}\n`;
}

export type PromptInput = { siteId: string; companyName: string; repoFullName: string; kind: BriefInput["kind"]; guideUrl: string; hasCgp: boolean };

/** The prompt the owner pastes into a fresh Claude session. The guide URL lives only here and in Nastavitve. */
export function buildKickoffPrompt(p: PromptInput): string {
  const first = p.hasCgp ? "CGP že obstaja: preglej ga in ga po potrebi popravi." : "Naredi celostno grafično podobo (CGP): barve, pisave, logotip, ton.";
  return [
    `Delaš na spletni strani za stranko »${p.companyName}« (ID strani: ${p.siteId}, vrsta: ${p.kind}).`,
    "",
    "1. Preberi:",
    `   - repozitorij ${p.repoFullName} (veja dev): CLAUDE.md, BRIEF.md, brief/assets/INDEX.md`,
    `   - navodila za gradnjo (verzija, ki jo je CRM zapisal v editor.config.json): ${p.guideUrl}`,
    "2. Vsa dejstva o stranki so v BRIEF.md. Lastniku ne postavljaj vprašanj, na katera BRIEF že odgovarja; vprašaj samo, česar tam ni.",
    "3. Delaj po fazah in po vsaki pokliči MCP orodje save_project_status(site_id, stage, note, links):",
    "   - cgp: " + first,
    "   - research: raziskava trga (konkurenca, kaj dela dobre strani v panogi, ključne besede).",
    "   - design_draft: osnutek dizajna (barve, tipografija, struktura strani, zaslonske slike ali predogled). Tukaj se ustaviš.",
    "4. Faze design_approved NE nastavljaš in ne začneš graditi. Dizajn odobri samo lastnik v CRM-ju; potem ti pošlje nadaljevanje.",
    "5. Kasneje (po odobritvi): gradi samo po pravilih iz CLAUDE.md in navodil, na veji dev; ob koncu stage preview_ready s povezavo do predogleda.",
    "",
    `Za začetek pokliči get_project("${p.siteId}") in mi povej v enem odstavku, kaj si razumel o stranki.`,
  ].join("\n");
}
