/*
 * Smart search lists (owner 2026-10-19: "da mam glavne dejavnosti, kraje na seznamih ... ko izberem potem sam išče še
 * sopomenke"). Activities with the words people (and Google) use for them, and Slovenian towns by statistical region,
 * with parts of the bigger cities. Google returns at most 60 results per query, so more leads come from more queries,
 * not from repeating one.
 */

export type Activity = { key: string; label: string; synonyms: string[] };

export const ACTIVITIES: Activity[] = [
  { key: "frizer", label: "Frizerski saloni", synonyms: ["frizerski salon", "frizer", "frizerka", "frizerski studio", "barber"] },
  { key: "kozmetika", label: "Kozmetični saloni", synonyms: ["kozmetični salon", "kozmetičarka", "lepotni salon", "manikura", "pedikura"] },
  { key: "trepalnice", label: "Trepalnice, obrvi, nohti", synonyms: ["podaljševanje trepalnic", "lash lift", "nohti gel", "obrvi"] },
  { key: "masaza", label: "Masaže in wellness", synonyms: ["masaža", "masažni salon", "wellness", "savna"] },
  { key: "fitnes", label: "Fitnes in osebni trenerji", synonyms: ["fitnes", "osebni trener", "pilates", "joga studio", "crossfit"] },
  { key: "gostinstvo", label: "Gostilne in restavracije", synonyms: ["gostilna", "restavracija", "pizzerija", "okrepčevalnica", "bistro"] },
  { key: "kavarna", label: "Kavarne, bari, slaščičarne", synonyms: ["kavarna", "bar", "slaščičarna", "pekarna"] },
  { key: "nastanitve", label: "Apartmaji in sobe", synonyms: ["apartmaji", "sobe", "turistična kmetija", "glamping", "hostel"] },
  { key: "avto", label: "Avtoservisi", synonyms: ["avtoservis", "vulkanizer", "avtokleparstvo", "avtoličarstvo", "avtopralnica"] },
  { key: "obrtniki", label: "Obrtniki (gradnja)", synonyms: ["električar", "vodoinštalater", "keramičar", "slikopleskar", "krovec", "fasaderstvo"] },
  { key: "mizar", label: "Mizarji in kovinarji", synonyms: ["mizarstvo", "ključavničarstvo", "kovinarstvo", "steklarstvo"] },
  { key: "ciscenje", label: "Čiščenje in vrtnarjenje", synonyms: ["čistilni servis", "čiščenje", "vrtnarstvo", "urejanje okolice"] },
  { key: "zdravje", label: "Zdravje (zasebno)", synonyms: ["zobozdravnik", "fizioterapija", "kiropraktik", "psihoterapevt", "optika"] },
  { key: "veterina", label: "Živali", synonyms: ["veterinar", "pasji salon", "šola za pse", "trgovina za živali"] },
  { key: "storitve", label: "Poslovne storitve", synonyms: ["računovodstvo", "nepremičnine", "zavarovalni zastopnik", "prevajalec"] },
  { key: "foto", label: "Foto in dogodki", synonyms: ["fotograf", "poročni fotograf", "dj", "cvetličarna", "organizacija porok"] },
  { key: "trgovine", label: "Male trgovine", synonyms: ["butik", "trgovina z oblačili", "trgovina", "darilna trgovina"] },
  { key: "solanje", label: "Tečaji in šole", synonyms: ["avtošola", "jezikovna šola", "plesna šola", "inštrukcije", "glasbena šola"] },
];

export type Region = { key: string; label: string; towns: string[] };

export const REGIONS: Region[] = [
  { key: "pomurska", label: "Pomurska", towns: ["Murska Sobota", "Lendava", "Ljutomer", "Gornja Radgona", "Radenci", "Beltinci"] },
  { key: "podravska", label: "Podravska", towns: ["Maribor", "Ptuj", "Slovenska Bistrica", "Ormož", "Lenart", "Ruše", "Rače", "Hoče", "Miklavž na Dravskem polju", "Kidričevo", "Selnica ob Dravi"] },
  { key: "koroska", label: "Koroška", towns: ["Ravne na Koroškem", "Slovenj Gradec", "Dravograd", "Radlje ob Dravi", "Prevalje", "Mežica"] },
  { key: "savinjska", label: "Savinjska", towns: ["Celje", "Velenje", "Žalec", "Šentjur", "Laško", "Slovenske Konjice", "Rogaška Slatina", "Šoštanj", "Vojnik", "Štore", "Prebold", "Polzela", "Zreče", "Šmarje pri Jelšah", "Mozirje"] },
  { key: "zasavska", label: "Zasavska", towns: ["Trbovlje", "Zagorje ob Savi", "Hrastnik"] },
  { key: "posavska", label: "Posavska", towns: ["Krško", "Brežice", "Sevnica"] },
  { key: "jugovzhodna", label: "Jugovzhodna Slovenija", towns: ["Novo mesto", "Črnomelj", "Metlika", "Trebnje", "Kočevje", "Ribnica"] },
  { key: "osrednjeslovenska", label: "Osrednjeslovenska", towns: ["Ljubljana", "Domžale", "Kamnik", "Grosuplje", "Vrhnika", "Logatec", "Medvode", "Litija", "Ivančna Gorica", "Škofljica", "Mengeš", "Trzin"] },
  { key: "gorenjska", label: "Gorenjska", towns: ["Kranj", "Jesenice", "Škofja Loka", "Radovljica", "Bled", "Tržič", "Kranjska Gora", "Bohinj", "Cerklje na Gorenjskem"] },
  { key: "primorsko-notranjska", label: "Primorsko-notranjska", towns: ["Postojna", "Ilirska Bistrica", "Cerknica", "Pivka"] },
  { key: "goriska", label: "Goriška", towns: ["Nova Gorica", "Ajdovščina", "Tolmin", "Idrija", "Šempeter pri Gorici", "Bovec", "Kobarid"] },
  { key: "obalno-kraska", label: "Obalno-kraška", towns: ["Koper", "Izola", "Piran", "Portorož", "Sežana", "Ankaran"] },
];

/** Parts of the bigger cities: one query per part finds businesses the city-wide query cuts off at 60. */
export const CITY_PARTS: Record<string, string[]> = {
  Ljubljana: ["Center", "Bežigrad", "Šiška", "Vič", "Moste", "Fužine", "Črnuče", "Rudnik", "Polje"],
  Maribor: ["Center", "Tabor", "Tezno", "Studenci", "Pobrežje", "Radvanje", "Nova vas"],
  Celje: ["Center", "Hudinja", "Gaberje", "Lava", "Ljubečna"],
  Kranj: ["Center", "Primskovo", "Stražišče", "Planina"],
  Koper: ["Center", "Žusterna", "Semedela"],
  "Novo mesto": ["Center", "Bršljin", "Ločna"],
  Velenje: ["Center", "Gorica", "Konovo"],
  Ptuj: ["Center", "Breg", "Rogoznica"],
};

export const activityByKey = (k: string) => ACTIVITIES.find((a) => a.key === k) ?? null;
export const regionOf = (town: string) => REGIONS.find((r) => r.towns.includes(town)) ?? null;
export const ALL_TOWNS = REGIONS.flatMap((r) => r.towns);

export type PlannedQuery = { query: string; town: string; part: string | null; synonym: string };

/**
 * Queries for one activity and town, best first: the main word in the town, the other words in the town, the city
 * parts, then (with `nearby`) the other towns of the region.
 */
export function planQueries(activity: Activity, town: string, nearby: boolean): PlannedQuery[] {
  const [main, ...rest] = activity.synonyms;
  const out: PlannedQuery[] = [];
  const add = (synonym: string, t: string, part: string | null = null) => out.push({ query: `${synonym} ${t}${part ? ` ${part}` : ""}`, town: t, part, synonym });
  add(main, town);
  for (const s of rest) add(s, town);
  for (const p of CITY_PARTS[town] ?? []) for (const s of [main, ...rest.slice(0, 1)]) add(s, town, p);
  if (nearby) {
    const others = (regionOf(town)?.towns ?? []).filter((t) => t !== town);
    for (const t of others) add(main, t);
    for (const t of others) for (const s of rest.slice(0, 2)) add(s, t);
  }
  return out;
}
