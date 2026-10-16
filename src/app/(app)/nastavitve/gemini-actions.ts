"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { saveGemini } from "@/server/google/gemini";

export async function saveGeminiAction(_prev: { ok: boolean; message: string } | null, form: FormData) {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const apiKey = String(form.get("apiKey") ?? "").trim();
  const model = String(form.get("model") ?? "").trim();
  if (apiKey && !/^[A-Za-z0-9_-]{20,100}$/.test(apiKey)) return { ok: false, message: "Ključ ni videti pravilen (začne se z AIza…)." };
  if (model && !/^[a-z0-9.-]{3,60}$/.test(model)) return { ok: false, message: "Ime modela ni pravilno." };
  await saveGemini(getDb(), { apiKey: apiKey || null, model: model || null });
  revalidatePath("/nastavitve");
  return { ok: true, message: apiKey ? "Ključ je shranjen." : "Shranjeno." };
}
