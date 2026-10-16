"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { saveSettings, validateSettings } from "@/server/settings";

export type SaveState = { ok: boolean; message: string } | null;

export async function saveSettingsAction(_prev: SaveState, form: FormData): Promise<SaveState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran." };
  const v = validateSettings({
    sendingEnabled: form.get("sendingEnabled") === "on",
    dailySendCap: String(form.get("dailySendCap") ?? ""),
    bookingUrl: String(form.get("bookingUrl") ?? ""),
    ownerPhone: String(form.get("ownerPhone") ?? ""),
    aiDailyBudgetUsd: String(form.get("aiDailyBudgetUsd") ?? ""),
    placesDailyCap: String(form.get("placesDailyCap") ?? ""),
  });
  if (!v.ok) return v;
  await saveSettings(getDb(), v.value);
  for (const p of ["/nastavitve", "/osnutki", "/iskanje", "/"]) revalidatePath(p);
  return { ok: true, message: "Shranjeno. Velja takoj." };
}
