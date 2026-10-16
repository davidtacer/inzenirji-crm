"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { disconnect } from "@/server/google/calendar";

export async function disconnectGoogleAction(_prev: { ok: boolean; message: string } | null) {
  void _prev;
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  await disconnect(getDb());
  revalidatePath("/nastavitve");
  return { ok: true, message: "Povezava prekinjena." };
}
