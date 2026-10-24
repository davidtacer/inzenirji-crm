"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { clearSitesToken, getGithubConfig, saveSitesConfig, validateSitesConfig } from "@/server/sites/config";
import { createGithub } from "@/server/sites/github";

type State = { ok: boolean; message: string } | null;
const f = (form: FormData, k: string) => String(form.get(k) ?? "");

export async function saveSitesAction(_prev: State, form: FormData): Promise<State> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const db = getDb();
  const v = validateSitesConfig({
    appId: f(form, "appId"), installationId: f(form, "installationId"), owner: f(form, "owner"), templateRepo: f(form, "templateRepo"), editorConfigRepo: f(form, "editorConfigRepo"),
    siteGuideUrl: f(form, "siteGuideUrl"), guideVersion: f(form, "guideVersion"), privateKey: f(form, "privateKey"), token: f(form, "token"),
  });
  if (!v.ok) return v;
  await saveSitesConfig(db, v.value, v.privateKey, new Date(), v.token);
  if (form.get("removeToken") === "on") await clearSitesToken(db);
  revalidatePath("/nastavitve");
  return { ok: true, message: "Shranjeno. Klikni »Preveri povezavo«." };
}

export async function testSitesAction(): Promise<State> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const cfg = await getGithubConfig(getDb());
  if (!cfg) return { ok: false, message: "GitHub še ni nastavljen (App ID, Installation ID in ključ ali žeton)." };
  try {
    const w = await createGithub(cfg).whoami();
    return { ok: true, message: `Povezava deluje: ${w.app}, ${w.owner}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Povezava ni uspela." };
  }
}
