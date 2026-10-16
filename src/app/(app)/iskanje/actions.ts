"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db/client";
import { getSettings } from "@/server/settings";
import { getCurrentUser } from "@/server/auth/session";
import { PlacesError } from "@/server/places/client";
import { runPlacesSearch, validateSearch } from "@/server/places/search";

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
