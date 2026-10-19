"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db/client";
import { getSettings } from "@/server/settings";
import { getCurrentUser } from "@/server/auth/session";
import { PlacesError } from "@/server/places/client";
import { runPlacesSearch, validateSearch } from "@/server/places/search";
import { activityByKey, regionOf } from "@/server/places/catalog";
import { runSmartSearch } from "@/server/places/smart";
import { runningJob, startJob } from "@/server/jobs";

export type SearchState = { ok: boolean; message: string } | null;

export async function searchAction(_prev: SearchState, form: FormData): Promise<SearchState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran." };
  const input = validateSearch({ query: form.get("query"), pages: form.get("pages") });
  if (!input) return { ok: false, message: "Vpiši iskanje (3–100 znakov) in 1–3 strani." };
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { ok: false, message: "Ključ GOOGLE_PLACES_API_KEY ni nastavljen na strežniku." };
  const dailyCap = (await getSettings(getDb())).placesDailyCap;
  try {
    const r = await runPlacesSearch(getDb(), input, { apiKey, dailyCap });
    revalidatePath("/iskanje");
    revalidatePath("/");
    const quota = r.stoppedByQuota ? " Dnevna meja klicev je dosežena, ostale strani jutri." : "";
    return { ok: true, message: `Najdenih ${r.found}: novih ${r.created}, posodobljenih ${r.updated}. Klicev: ${r.calls}.${quota}` };
  } catch (e) {
    if (e instanceof PlacesError) {
      const hint = e.status === 403 ? " Preveri omejitve ključa (IP strežnika, Places API)." : "";
      return { ok: false, message: `Google Places je vrnil napako ${e.status}.${hint}` };
    }
    console.error("[places] search failed:", e instanceof Error ? e.message : "unknown");
    return { ok: false, message: "Iskanje ni uspelo. Poskusi znova čez minuto." };
  }
}

/** Smart search (activity + town, synonyms, parts, region) as a background job. */
export async function smartSearchAction(_prev: SearchState, form: FormData): Promise<SearchState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran." };
  const activity = String(form.get("activity") ?? "");
  const town = String(form.get("town") ?? "");
  const nearby = form.get("nearby") === "on";
  const budget = Number(form.get("budget") ?? 10);
  if (!activityByKey(activity) || !regionOf(town) || ![5, 10, 20, 40].includes(budget)) return { ok: false, message: "Izberi dejavnost, kraj in število klicev." };
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { ok: false, message: "Ključ GOOGLE_PLACES_API_KEY ni nastavljen na strežniku." };
  const db = getDb();
  if (await runningJob(db, ["smart_search"])) return { ok: false, message: "Iskanje že teče." };
  const dailyCap = (await getSettings(db)).placesDailyCap;
  await startJob(
    db,
    { kind: "smart_search" },
    async (progress) => {
      const r = await runSmartSearch(db, { activity, town, nearby, budget }, { apiKey, dailyCap }, (p) => progress({ done: p.done, failed: 0, total: p.total }));
      revalidatePath("/iskanje");
      const parts = [
        `Novih podjetij: ${r.created}`,
        `posodobljenih: ${r.updated}`,
        `poizvedb: ${r.queries}${r.skipped ? ` (${r.skipped} že iskanih preskočenih)` : ""}`,
        `klicev: ${r.calls}`,
      ];
      const tail = r.stoppedByQuota ? " Dnevna meja klicev je dosežena." : r.left ? ` Ostalo še ${r.left} poizvedb - poženi znova za več.` : r.queries === 0 ? " Tu je že vse preiskano - izberi drug kraj ali vklopi okoliške kraje." : "";
      return `${parts.join(", ")}.${tail}`;
    },
  );
  revalidatePath("/iskanje");
  return { ok: true, message: "Iščem …" };
}
