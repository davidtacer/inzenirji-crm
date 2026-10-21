"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { importCompanyHistory, syncMailbox } from "@/server/mailbox/sync";
import { REPLY_LABEL } from "@/lib/replyLabels";

export type ActionState = { ok: boolean; message: string } | null;

export async function syncAction(_prev: ActionState): Promise<ActionState> {
  void _prev;
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran." };
  const s = await syncMailbox(getDb());
  revalidatePath("/odgovori");
  revalidatePath("/osnutki");
  revalidatePath("/");
  if (s.ok === false) return { ok: false, message: s.message };
  if (s.ok === null) return { ok: true, message: "Nabiralnik je bil pravkar prebran." };
  const parts = Object.entries(s.result.byClass).map(([k, n]) => `${n}× ${REPLY_LABEL[k].toLowerCase()}`);
  return { ok: true, message: `Novih e-mailov: ${s.result.seen}, od podjetij iz baze: ${s.result.stored}${parts.length ? ` (${parts.join(", ")})` : ""}. Tvojih poslanih podjetjem: ${s.sentStored}.` };
}

export async function historyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran." };
  const id = form.get("companyId");
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return { ok: false, message: "Neveljavno podjetje." };
  const r = await importCompanyHistory(getDb(), id);
  revalidatePath(`/podjetja/${id}`);
  revalidatePath("/odgovori");
  if (!r.ok) return r;
  return { ok: true, message: r.inbound + r.sent ? `Uvoženo: ${r.sent} tvojih in ${r.inbound} njihovih e-mailov.` : "V nabiralniku ni najdenih e-mailov s tem podjetjem (zadnjih 12 mesecev)." };
}

export async function releaseHeldAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran." };
  const id = form.get("id");
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return { ok: false, message: "Neveljavno sporočilo." };
  const { releaseHeld } = await import("@/server/leads/guard");
  const { getSettings } = await import("@/server/settings");
  const { aiConfig } = await import("@/server/ai/remark");
  const { contactOptions } = await import("@/server/mailbox/reply");
  const db = getDb();
  const st = await getSettings(db);
  const r = await releaseHeld(db, id, { ai: aiConfig(st), contact: contactOptions(st) });
  revalidatePath("/odgovori");
  revalidatePath("/osnutki");
  return r ? { ok: true, message: "Preneseno v CRM. Osnutek odgovora čaka v Osnutkih." } : { ok: false, message: "Sporočila ni več." };
}
