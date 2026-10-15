export const STAGE_LABEL: Record<string, string> = {
  found: "najdeno",
  researched: "raziskano",
  contacted: "kontaktirano",
  replied: "odgovoril",
  call_booked: "klic",
  call_done: "po klicu",
  proposal_sent: "ponudba",
  won: "stranka",
  lost: "izgubljeno",
  nurture: "kasneje",
};

export const SOURCE_LABEL: Record<string, string> = {
  places_search: "Google Places",
  outreach_reply: "odgovor na e-mail",
  meta_lead_form: "Meta obrazec",
  google_ads: "Google Ads",
  website_form: "obrazec na strani",
  editor_demo: "demo urejevalnika",
  site_audit: "pregled strani",
  referral: "priporočilo",
  partner: "partner",
  manual: "ročno",
};

export const GROUP_LABEL: Record<"A" | "B", string> = { A: "A · prenos", B: "B · nova stran" };
export const GROUP_HELP: Record<"A" | "B", string> = {
  A: "Že ima svojo spletno stran — prenesemo jo na naš sistem z urejevalnikom (cena po pregledu).",
  B: "Nima prave strani (nič, samo Facebook ali link, ali se ne odpre) — ponudimo novo stran.",
};
