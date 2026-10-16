"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { createDemoToken } from "@/server/demo/demo";

export async function createDemoTokenAction(_prev: { token?: string; message: string } | null) {
  void _prev;
  if (!(await getCurrentUser())) return { message: "Prijava je potekla." };
  const token = await createDemoToken(getDb());
  revalidatePath("/nastavitve");
  return { token, message: "Nov ključ je ustvarjen. Kopiraj ga v Cloudflare (koraki spodaj)." };
}
