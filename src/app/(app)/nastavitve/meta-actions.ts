"use server";
import { revalidatePath } from "next/cache";
import { checkAccount, metaConfig, metaMessage, parseAccountId, saveMeta } from "@/server/ads/meta";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";

type State = { ok: boolean; message: string } | null;

/** Saves the Meta token (encrypted) and ad account, then checks them against the API (TASK-015). */
export async function saveMetaAction(_prev: State, form: FormData): Promise<State> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const token = String(form.get("token") ?? "").trim();
  const rawAccount = String(form.get("accountId") ?? "").trim();
  const accountId = rawAccount ? parseAccountId(rawAccount) : null;
  if (token && !/^[A-Za-z0-9_-]{30,600}$/.test(token)) return { ok: false, message: "Žeton ni videti pravilen (dolg niz črk in številk, brez presledkov)." };
  if (rawAccount && !accountId) return { ok: false, message: "ID oglasnega računa ni pravilen (npr. act_1234567890 ali samo številka)." };
  const db = getDb();
  await saveMeta(db, { token: token || null, accountId });
  revalidatePath("/nastavitve");
  const cfg = await metaConfig(db);
  if (!cfg) return { ok: true, message: "Shranjeno. Manjka še " + (accountId ? "žeton." : "ID oglasnega računa.") };
  try {
    const a = await checkAccount(cfg);
    return { ok: true, message: `Povezano: ${a.name || "oglasni račun"} (${a.currency}).` };
  } catch (e) {
    return { ok: false, message: `Shranjeno, a preverjanje ni uspelo: ${metaMessage(e)}` };
  }
}
