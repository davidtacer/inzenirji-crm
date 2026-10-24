import { pagesProjects } from "./siteId";

/*
 * Manual steps for the owner (TASK-039 §5). Copied from the editor guide (§18.3, §19.2, §19.3, §20, §22.3); nothing
 * here is automated in v1 (ADR-056). Ticks are stored in `site_projects.checklist` ({ key: ISO time }).
 */

export type ChecklistItem = { key: string; title: string; steps: string[] };

export function checklistFor(siteId: string, domain: string | null): ChecklistItem[] {
  const p = pagesProjects(siteId);
  const d = domain ?? "vasa-stran.si";
  return [
    {
      key: "cloudflare",
      title: "Cloudflare Pages: dva projekta",
      steps: [
        "Odpri dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git → izberi repozitorij strani (GitHub račun davidtacer).",
        `Ime projekta: ${p.live}. Production branch: main. Framework preset: Next.js (Static HTML Export). Build command: npm run build. Build output directory: out. Spremenljivka okolja NODE_VERSION = 22. Klikni Save and Deploy.`,
        `Ponovi za drugi projekt: isti repozitorij, ime ${p.dev}, Production branch: dev, iste nastavitve builda.`,
        `V projektu ${p.live} → Custom domains → dodaj ${d} in www.${d}. (Šele ko je stran odobrena in pripravljena na objavo.)`,
        `Pričakuješ: oba projekta imata zeleni Deployment; ${p.dev}.pages.dev kaže stran, v glavah je X-Robots-Tag: noindex.`,
        "Če build pade: odpri Deployment → Build log in ga prilepi v pogovor z agentom.",
      ],
    },
    {
      key: "dns",
      title: "Domena in DNS",
      steps: [
        `Najlažje: domeno ${d} preusmeri na Cloudflare nameserverje (pri registrarju zamenjaj NS zapise z dvema, ki ju pokaže Cloudflare).`,
        `Če stranka domene ne seli: pri njej www.${d} CNAME na ${p.live}.pages.dev, koren domene pa preusmeri na www pri registrarju.`,
        "Pred preklopom: znižaj TTL, preveri, da MX zapisi (e-pošta) ostanejo, in da stari URL-ji dobijo preusmeritev.",
        "Zapiši (v »Opombe za agenta« ali »Zasebne opombe«), kdo je registrar in kdo ima dostop (domena ostane last stranke).",
      ],
    },
    {
      key: "notify",
      title: "Obvestilo o buildu",
      steps: [
        "Cloudflare → Notifications → Add → Pages (Deployment events).",
        `Destinacija: Webhook na naslov, ki ga navede urejevalnik. Filter: projekta ${p.dev} in ${p.live}.`,
        "Pričakuješ: po commitu na dev urejevalnik javi »predogled pripravljen«. Če ne, deluje rezerva (polling), a počasneje.",
      ],
    },
    {
      key: "editors",
      title: "Uredniki (e-naslovi)",
      steps: [
        "Stranka ti pisno sporoči e-naslov(e) in vlogo. Sporočilo shrani na kartico stranke.",
        "Na tej strani spodaj dodaj uredniku e-naslov in vlogo in klikni »Shrani urednike«, nato »Osveži paket« (zapiše sites/<id>/editors.json v zasebni repozitorij urejevalnika).",
        `Preizkus: v zasebnem oknu odpri https://uredi.inzenirji.si/?site=${siteId}, vpiši e-naslov, preveri, da prispe povezava in da po kliku vidiš pravo stran.`,
        `Šele nato v editor.config.json nastavi enabled na true (agent to naredi na tvoj ukaz); potem ${d}/uredi preusmeri v urejevalnik.`,
      ],
    },
    {
      key: "ga4",
      title: "Google Analytics 4",
      steps: [
        `Odpri analytics.google.com → Admin → Create → Property. Ime: ${d}. Časovni pas Slovenija, valuta EUR.`,
        `Ustvari Web data stream za https://${d} in kopiraj Measurement ID (G-…).`,
        "Admin → Data collection and modification → Data retention: 2 meseca.",
        "Property access management → Add → e-naslov stranke → vloga Viewer.",
        "Measurement ID vpiši v polje spodaj (GA4) ali ga povej agentu; agent ga zapiše v content/site.json → analytics.measurementId.",
        "Po objavi: sprejmi piškotke in preveri Realtime; v zasebnem oknu zavrni piškotke in preveri, da se obisk ne pojavi.",
      ],
    },
  ];
}
