"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { syncMailbox } from "@/server/mailbox/sync";
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
  return { ok: true, message: `Novih e-mailov: ${s.result.seen}, od tega od podjetij iz baze: ${s.result.stored}${parts.length ? ` (${parts.join(", ")})` : ""}.` };
}
