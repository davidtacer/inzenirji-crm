"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { createMcpToken } from "@/server/mcp/mcp";

export async function createMcpTokenAction(_prev: { url?: string; message: string } | null) {
  void _prev;
  if (!(await getCurrentUser())) return { message: "Prijava je potekla." };
  const token = await createMcpToken(getDb());
  revalidatePath("/nastavitve");
  const base = (process.env.APP_URL ?? "https://crm.inzenirji.si").replace(/\/+$/, "");
  return { url: `${base}/api/mcp/${token}`, message: "Nov naslov je ustvarjen. Dodaj ga v Claude kot konektor (koraki spodaj)." };
}
