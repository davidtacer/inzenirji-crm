"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { aiConfig } from "@/server/ai/remark";
import { getSettings } from "@/server/settings";
import { prepareBrief, saveCallNotes, setStage, type Stage } from "@/server/calls/calls";
import { fromLocalInput } from "@/lib/time";

export type ActionState = { ok: boolean; message: string } | null;
const EXPIRED: ActionState = { ok: false, message: "Prijava je potekla. Osveži stran." };
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v);
const STAGES: Stage[] = ["found", "researched", "contacted", "replied", "call_booked", "call_done", "proposal_sent", "won", "lost", "nurture"];

function refresh(id: string) {
  for (const p of ["/klici", "/", "/podjetja", `/podjetja/${id}`, "/osnutki"]) revalidatePath(p);
}

export async function stageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return EXPIRED;
  const id = form.get("companyId");
  const stage = String(form.get("stage") ?? "") as Stage;
  if (!isId(id) || !STAGES.includes(stage)) return { ok: false, message: "Neveljavna izbira." };
  const raw = String(form.get("callAt") ?? "");
  const callAt = raw ? fromLocalInput(raw) : null;
  if (raw && !callAt) return { ok: false, message: "Neveljaven datum." };
  const err = await setStage(getDb(), id, { stage, callAt, lostReason: String(form.get("lostReason") ?? "") });
  refresh(id);
  return err ? { ok: false, message: err } : { ok: true, message: "Faza posodobljena." };
}

export async function briefAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return EXPIRED;
  const id = form.get("companyId");
  if (!isId(id)) return { ok: false, message: "Neveljavno podjetje." };
  const db = getDb();
  const b = await prepareBrief(db, id, aiConfig(await getSettings(db)));
  refresh(id);
  return b ? { ok: true, message: b.source === "ai" ? "Brief je pripravljen." : "Brief je pripravljen iz pravil (AI ni na voljo)." } : { ok: false, message: "Podjetja ni." };
}

export async function notesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return EXPIRED;
  const id = form.get("companyId");
  if (!isId(id)) return { ok: false, message: "Neveljavno podjetje." };
  const db = getDb();
  const r = await saveCallNotes(db, id, String(form.get("notes") ?? ""), aiConfig(await getSettings(db)));
  refresh(id);
  return r.ok ? { ok: true, message: "Zapiski shranjeni, povzetek spodaj." } : r;
}
