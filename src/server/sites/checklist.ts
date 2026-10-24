import { devUrl, pagesProjects } from "./siteId";

/*
 * Manual steps for the owner, one card per site with its own names filled in (TASK-039 §5, runbook in
 * docs/technical/cloudflare.md). Nothing here is automated (ADR-056). Ticks are stored in `site_projects.checklist`.
 * Rule: the dev preview is always dev.<client domain>; never send a *.pages.dev / *.workers.dev link (Chrome
 * flags names like vodniskuter-si-dev.pages.dev as a fake of vodniskuter.si).
 */

export type ChecklistItem = { key: string; title: string; steps: string[] };

export function checklistFor(siteId: string, domain: string | null): ChecklistItem[] {
  const p = pagesProjects(siteId);
  const d = domain ?? "vasa-stran.si";
  const dev = domain ? devUrl(siteId, domain) : `https://dev.${d}`;
  return [
    {
      key: "dns",
      title: "1. Domena na Cloudflaru (pred predogledom)",
      steps: [
        `Cloudflare → Add a domain → ${d} → Free. Cloudflare prebere obstoječe DNS zapise: preveri, da so med njimi A/CNAME za živo stran in MX za e-pošto (če manjkajo, jih prepiši od registrarja).`,
        `Pri registrarju domene ${d} zamenjaj nameserverje z dvema, ki ju pokaže Cloudflare. Živa stran in e-pošta delujeta naprej, ker so zapisi isti. Pričakuješ: v Cloudflare je domena »Active« (do nekaj ur).`,
        `Če stranka domene ne seli: pri njenem DNS ponudniku dodaj CNAME dev.${d} → ${p.dev}.pages.dev (za predogled) in ob objavi www.${d} → ${p.live}.pages.dev.`,
        "Zapiši v »Zasebne opombe«, kdo je registrar in kdo ima dostop (domena ostane last stranke).",
      ],
    },
    {
      key: "cloudflare",
      title: "2. Cloudflare Pages: živa stran in predogled",
      steps: [
        "Cloudflare → Workers & Pages → Create → Pages → Connect to Git → izberi repozitorij strani (GitHub račun davidtacer).",
        `Projekt ${p.live}: Production branch main. Framework preset Next.js (Static HTML Export). Build command npm run build. Build output directory out. Spremenljivka okolja NODE_VERSION = 22. Save and Deploy.`,
        `Projekt ${p.dev}: isti repozitorij, Production branch dev, iste nastavitve. V obeh projektih: Settings → Builds → Preview branches = None (predogledov po vejah ne rabimo).`,
        `Projekt ${p.dev} → Custom domains → Set up a custom domain → dev.${d} → Activate. To je naslov predogleda za stranko in urejevalnik.`,
        `Pričakuješ: ${dev} kaže stran, ${dev}/robots.txt ima »Disallow: /«, ${dev}/uredi kaže »Urejevalnik bo kmalu na voljo«.`,
        `Stranki nikoli ne pošlji naslova *.pages.dev ali *.workers.dev: Chrome ga označi kot ponaredek ${d} (»Did you mean ${d}?«).`,
        `Ob objavi (šele ko je stran odobrena): projekt ${p.live} → Custom domains → ${d} in www.${d}.`,
        "Če build pade: Deployment → View build log, zadnjih 20 vrstic prilepi agentu.",
      ],
    },
    {
      key: "notify",
      title: "3. Obvestilo o buildu",
      steps: [
        "Cloudflare → Notifications → Add → Pages → Deployment events.",
        `Destinacija: Webhook na naslov, ki ga navede urejevalnik. Filter: projekta ${p.dev} in ${p.live}.`,
        "Pričakuješ: po commitu na dev urejevalnik javi »predogled pripravljen«. Če ne, deluje rezerva (polling), a počasneje.",
      ],
    },
    {
      key: "editors",
      title: "4. Uredniki (e-naslovi)",
      steps: [
        "Stranka ti pisno sporoči e-naslov(e) in vlogo. Sporočilo shrani na kartico stranke.",
        "Na tej strani spodaj dodaj uredniku e-naslov in vlogo in klikni »Shrani urednike«, nato »Osveži paket« (zapiše sites/<id>/editors.json v zasebni repozitorij inzenirji-editor-config).",
        `Preizkus: v zasebnem oknu odpri https://uredi.inzenirji.si/?site=${siteId}, vpiši e-naslov, preveri, da prispe povezava in da po kliku vidiš pravo stran.`,
        `Šele nato v editor.config.json nastavi enabled na true (agent to naredi na tvoj ukaz, najprej na dev); potem ${d}/uredi preusmeri v urejevalnik.`,
      ],
    },
    {
      key: "ga4",
      title: "5. Google Analytics 4",
      steps: [
        `Odpri analytics.google.com → Admin → Create → Property. Ime: ${d}. Časovni pas Slovenija, valuta EUR.`,
        `Ustvari Web data stream za https://${d} in kopiraj Measurement ID (G-…).`,
        "Admin → Data collection and modification → Data retention: 2 meseca.",
        "Property access management → Add → e-naslov stranke → vloga Viewer.",
        "Measurement ID povej agentu; agent ga zapiše v content/site.json → analytics.measurementId.",
        "Po objavi: sprejmi piškotke in preveri Realtime; v zasebnem oknu zavrni piškotke in preveri, da se obisk ne pojavi.",
      ],
    },
  ];
}
