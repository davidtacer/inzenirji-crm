"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db/client";
import { acceptProposal } from "@/server/proposals/proposals";

export type AcceptState = { ok: boolean; message: string } | null;

/** Public: the client accepts (no login; the token in the link is the access). */
export async function acceptAction(_prev: AcceptState, form: FormData): Promise<AcceptState> {
  const token = String(form.get("token") ?? "");
  if (form.get("agree") !== "on") return { ok: false, message: "Označite, da se strinjate s ponudbo." };
  const err = await acceptProposal(getDb(), token, String(form.get("name") ?? ""));
  revalidatePath(`/ponudba/${token}`);
  return err ? { ok: false, message: err } : { ok: true, message: "Hvala! Ponudba je potrjena. Kmalu se vam oglasim." };
}
