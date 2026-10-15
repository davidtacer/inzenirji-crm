"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { researchBatch, runAudit } from "@/server/research/run";

function placesDeps() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  return apiKey ? { apiKey, dailyCap: Number(process.env.PLACES_DAILY_CALL_CAP ?? 100) } : undefined;
}

// Production research also asks public directories for an e-mail (TASK-025).
const DIRECTORIES = true;

export type ActionState = { ok: boolean; message: string } | null;

export async function researchOneAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran." };
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, message: "Neveljavno podjetje." };
  try {
    const r = await runAudit(getDb(), id, { places: placesDeps(), directories: DIRECTORIES });
    revalidatePath(`/podjetja/${id}`);
    revalidatePath("/podjetja");
    return { ok: true, message: `Raziskano: skupina ${r.group}, težav ${r.issues}, e-naslovov ${r.emails}${r.directoryEmails ? ` (${r.directoryEmails} iz bizi.si)` : ""}, konkurentov ${r.competitors}${r.competitorSource === "nearby" ? " (iz okolice)" : " (iz baze)"}.` };
  } catch (e) {
    console.error("[research] one failed:", e instanceof Error ? e.message : "unknown");
    return { ok: false, message: "Raziskava ni uspela. Poskusi znova." };
  }
}

export async function researchBatchAction(_prev: ActionState): Promise<ActionState> {
  void _prev;
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran." };
  const r = await researchBatch(getDb(), { limit: 20, concurrency: 3, places: placesDeps(), directories: DIRECTORIES });
  revalidatePath("/podjetja");
  revalidatePath("/");
  revalidatePath("/iskanje");
  if (r.done === 0 && r.failed === 0) return { ok: true, message: "Vsa podjetja so že raziskana." };
  return { ok: r.failed === 0, message: `Raziskanih ${r.done}${r.failed ? `, neuspešnih ${r.failed}` : ""}.` };
}

export async function deepenAction(_prev: ActionState): Promise<ActionState> {
  void _prev;
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran." };
  const r = await researchBatch(getDb(), { limit: 20, concurrency: 3, deepen: true, places: placesDeps(), directories: DIRECTORIES });
  revalidatePath("/podjetja");
  revalidatePath("/");
  if (r.done === 0 && r.failed === 0) return { ok: true, message: "Vsa raziskana podjetja so že poglobljeno raziskana." };
  return { ok: r.failed === 0, message: `Poglobljeno raziskanih ${r.done}${r.failed ? `, neuspešnih ${r.failed}` : ""}. Zdaj lahko znova pripraviš osnutke.` };
}
