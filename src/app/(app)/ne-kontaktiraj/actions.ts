"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { addToDnc } from "@/server/contact/dnc";
import { getDb } from "@/server/db/client";

export type AddState = { ok: boolean; message: string } | null;

/** Owner adds an e-mail or a whole domain by hand. Permanent (ADR-007): there is no undo. */
export async function addDncAction(_prev: AddState, form: FormData): Promise<AddState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const value = String(form.get("value") ?? "").trim().toLowerCase();
  const reason = String(form.get("reason") ?? "").trim().slice(0, 200) || "dodal lastnik";
  if (form.get("confirm") !== "on") return { ok: false, message: "Potrdi, da je to trajno." };
  const kind = value.includes("@") ? "email" : "domain";
  if (kind === "email" && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(value)) return { ok: false, message: "E-naslov ni pravilen." };
  if (kind === "domain" && !/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/.test(value)) return { ok: false, message: "Vpiši e-naslov (ime@podjetje.si) ali domeno (podjetje.si)." };
  try {
    await addToDnc(getDb(), { kind, value, reason });
  } catch {
    return { ok: false, message: "Vpisa ni bilo mogoče shraniti." };
  }
  revalidatePath("/ne-kontaktiraj");
  return { ok: true, message: kind === "email" ? "E-naslov je dodan." : "Domena je dodana: noben naslov na njej ne dobi več e-mailov." };
}
