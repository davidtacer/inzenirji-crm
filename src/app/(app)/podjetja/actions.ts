"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { researchBatch, runAudit } from "@/server/research/run";

export type ActionState = { ok: boolean; message: string } | null;

export async function researchOneAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran." };
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, message: "Neveljavno podjetje." };
  try {
    const r = await runAudit(getDb(), id);
    revalidatePath(`/podjetja/${id}`);
    revalidatePath("/podjetja");
    return { ok: true, message: `Raziskano: skupina ${r.group}, težav ${r.issues}, e-naslovov ${r.emails}, konkurentov ${r.competitors}.` };
  } catch (e) {
    console.error("[research] one failed:", e instanceof Error ? e.message : "unknown");
    return { ok: false, message: "Raziskava ni uspela. Poskusi znova." };
  }
}

export async function researchBatchAction(_prev: ActionState): Promise<ActionState> {
  void _prev;
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran." };
  const r = await researchBatch(getDb(), { limit: 20, concurrency: 3 });
  revalidatePath("/podjetja");
  revalidatePath("/");
  if (r.done === 0 && r.failed === 0) return { ok: true, message: "Vsa podjetja so že raziskana." };
  return { ok: r.failed === 0, message: `Raziskanih ${r.done}${r.failed ? `, neuspešnih ${r.failed}` : ""}.` };
}
