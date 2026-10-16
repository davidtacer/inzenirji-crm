"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { confirmationEmail, finalPaid, launchProject, materialsEmail, pauseProject, resumeProject, setItemDone } from "@/server/projects/projects";

export type ActionState = { ok: boolean; message: string } | null;
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v);

/** All owner buttons on the project page go through one action with an `op` field. */
export async function projectAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const id = form.get("id");
  if (!isId(id)) return { ok: false, message: "Neveljaven projekt." };
  const db = getDb();
  const op = String(form.get("op") ?? "");
  let res: ActionState = null;
  if (op === "materials") {
    const r = await materialsEmail(db, id);
    res = r.ok ? { ok: true, message: "E-mail s povezavo za materiale čaka v Osnutkih." } : r;
  } else if (op === "confirm") {
    const r = await confirmationEmail(db, id);
    res = r.ok ? { ok: true, message: "Potrditveni e-mail čaka v Osnutkih — ko ga pošlješ, začne teči rok." } : r;
  } else if (op === "pause") {
    const err = await pauseProject(db, id, String(form.get("reason") ?? ""));
    res = err ? { ok: false, message: err } : { ok: true, message: "Rok je ustavljen." };
  } else if (op === "resume") {
    await resumeProject(db, id);
    res = { ok: true, message: "Rok spet teče." };
  } else if (op === "launch") {
    await launchProject(db, id);
    res = { ok: true, message: "Stran objavljena." };
  } else if (op === "final") {
    await finalPaid(db, id);
    res = { ok: true, message: "Preostanek plačan." };
  } else if (op === "item") {
    await setItemDone(db, id, Number(form.get("index")), form.get("done") === "1");
    res = { ok: true, message: "Posodobljeno." };
  }
  for (const p of [`/projekti/${id}`, "/projekti", "/osnutki", "/"]) revalidatePath(p);
  return res ?? { ok: false, message: "Neznano dejanje." };
}
