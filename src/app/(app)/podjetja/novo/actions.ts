"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { createManualCompany, EMPTY_PREFILL, prefillFromUrl, type Prefill } from "@/server/companies/manual";
import { runAudit } from "@/server/research/run";

export type ReadState = { ok: boolean; message: string; prefill: Prefill; key: number } | null;
export type SaveState = { ok: boolean; message: string } | null;

export async function readAction(_prev: ReadState, form: FormData): Promise<ReadState> {
  const key = Date.now();
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran.", prefill: EMPTY_PREFILL, key };
  const url = String(form.get("url") ?? "").trim();
  if (!url) return { ok: false, message: "Prilepi povezavo.", prefill: EMPTY_PREFILL, key };
  try {
    const prefill = await prefillFromUrl(url);
    const found = [prefill.name && "ime", prefill.address && "naslov", prefill.phone && "telefon", prefill.email && "e-naslov", prefill.website && "spletno stran"].filter(Boolean);
    return { ok: true, message: found.length ? `Prebrano: ${found.join(", ")}. Preveri in dopolni.` : "S strani nisem prebral ničesar — vpiši ročno.", prefill, key };
  } catch {
    return { ok: false, message: "Strani ni bilo mogoče odpreti. Vpiši podatke ročno.", prefill: EMPTY_PREFILL, key };
  }
}

export async function saveAction(_prev: SaveState, form: FormData): Promise<SaveState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran." };
  const f = (k: keyof Prefill) => String(form.get(k) ?? "");
  const r = await createManualCompany(getDb(), {
    name: f("name"),
    address: f("address"),
    city: f("city"),
    phone: f("phone"),
    email: f("email"),
    emailSource: f("emailSource"),
    website: f("website"),
    category: f("category"),
  });
  if (!r.ok) return r;
  if (!r.existed) {
    try {
      // Research right away so a draft can be prepared (directories on, no Google: no place id).
      await runAudit(getDb(), r.id, { directories: true });
    } catch (e) {
      console.error("[manual] research failed:", e instanceof Error ? e.message : "unknown");
    }
  }
  revalidatePath("/podjetja");
  revalidatePath("/");
  redirect(`/podjetja/${r.id}${r.existed ? "?obstaja=1" : ""}`);
}
