"use server";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { companies, siteProjects } from "@/server/db/schema";
import { getGithubConfig } from "@/server/sites/config";
import { createGithub } from "@/server/sites/github";
import { startKickoff } from "@/server/sites/kickoff";
import { STAGES, type Stage } from "@/server/sites/stages";
import { checklistFor } from "@/server/sites/checklist";
import { createSiteProject, moveStage, registerSiteProject, setLinks, updateSiteFacts, type Kind } from "@/server/sites/store";

export type ActionState = { ok: boolean; message: string } | null;
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v);
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** "Nova stran": existing company (by id or exact name) or a new one made with the manual-entry logic. */
export async function createSiteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const db = getDb();
  let companyId = isId(form.get("companyId")) ? s(form, "companyId") : undefined;
  const name = s(form, "companyName");
  if (!companyId && name) {
    const found = await db.select({ id: companies.id }).from(companies).where(sql`lower(${companies.name}) = lower(${name})`).limit(2);
    if (found.length === 1) companyId = found[0]!.id;
  }
  const kind = s(form, "kind") as Kind;
  const r = await createSiteProject(db, {
    companyId,
    newCompany: companyId ? undefined : { name, address: "", city: s(form, "city"), phone: s(form, "phone"), email: s(form, "email"), emailSource: "", website: s(form, "currentUrl") || s(form, "domain"), category: "" },
    kind,
    siteId: s(form, "siteId") || undefined,
    domain: s(form, "domain"),
    currentUrl: s(form, "currentUrl"),
    contact: s(form, "contact"),
    languages: s(form, "languages").split(/[\s,;]+/).filter(Boolean),
    features: s(form, "features"),
    priceEur: s(form, "priceEur"),
    deadline: s(form, "deadline"),
    hasCgp: form.get("hasCgp") === "on",
    notes: s(form, "notes"),
    ownerNotes: s(form, "ownerNotes"),
    startReason: s(form, "startReason"),
    projectId: isId(form.get("projectId")) ? s(form, "projectId") : undefined,
  });
  if (!r.ok) return r;
  revalidatePath("/strani");
  redirect(`/strani/${r.id}`);
}

/** "Registriraj obstoječo stran": record only, nothing is created or written in any repository. */
export async function registerSiteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const db = getDb();
  let companyId = isId(form.get("companyId")) ? s(form, "companyId") : undefined;
  const name = s(form, "companyName");
  if (!companyId && name) {
    const found = await db.select({ id: companies.id }).from(companies).where(sql`lower(${companies.name}) = lower(${name})`).limit(2);
    if (found.length === 1) companyId = found[0]!.id;
  }
  const editors = s(form, "editors").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [email = "", role = "editor"] = l.split(/[\s,;]+/);
    return { email, role: role.toLowerCase() === "owner" ? ("owner" as const) : ("editor" as const) };
  });
  const state = s(form, "editorState");
  const r = await registerSiteProject(db, {
    companyId,
    newCompany: companyId ? undefined : { name, address: "", city: s(form, "city"), phone: s(form, "phone"), email: s(form, "email"), emailSource: "", website: s(form, "domain"), category: "" },
    kind: s(form, "kind") as Kind,
    siteId: s(form, "siteId") || undefined,
    domain: s(form, "domain"),
    liveUrl: s(form, "liveUrl"),
    repo: s(form, "repo"),
    hosting: s(form, "hosting"),
    legacy: form.get("legacy") === "on",
    editorState: state === "planned" || state === "active" ? state : "none",
    editors,
    notes: s(form, "notes"),
    ownerNotes: s(form, "ownerNotes"),
  });
  if (!r.ok) return r;
  revalidatePath("/strani");
  redirect(`/strani/${r.id}`);
}

/** All owner buttons on the site page go through one action with an `op` field. */
export async function siteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const id = form.get("id");
  if (!isId(id)) return { ok: false, message: "Neveljavna stran." };
  const db = getDb();
  const op = s(form, "op");
  let res: ActionState = { ok: false, message: "Neznano dejanje." };
  if (op === "kickoff" || op === "refresh") {
    const cfg = await getGithubConfig(db);
    if (!cfg) return { ok: false, message: "Najprej nastavi GitHub App: Nastavitve → Izdelava strani." };
    const r = await startKickoff(db, id, { gh: createGithub(cfg) }, { refreshBrief: op === "refresh" });
    res = r.ok ? { ok: true, message: "Priprava teče v ozadju, stran se osvežuje." } : r;
  } else if (op === "stage") {
    const to = s(form, "to") as Stage;
    if (!STAGES.includes(to)) return { ok: false, message: "Neznana faza." };
    const r = await moveStage(db, id, to, "owner", s(form, "note"));
    res = r.ok ? { ok: true, message: "Faza spremenjena." } : r;
  } else if (op === "approve") {
    const note = s(form, "note");
    if (note.length < 3) return { ok: false, message: "Napiši kratko opombo (npr. »odobreno, barve malo toplejše«)." };
    const r = await moveStage(db, id, "design_approved", "owner", note);
    res = r.ok ? { ok: true, message: "Dizajn odobren. Agent lahko začne graditi (kopiraj poziv in ga pošlji)." } : r;
  } else if (op === "tick") {
    const [row] = await db.select({ siteId: siteProjects.siteId, domain: siteProjects.domain, checklist: siteProjects.checklist }).from(siteProjects).where(eq(siteProjects.id, id));
    const key = s(form, "key");
    if (!row || !checklistFor(row.siteId, row.domain).some((c) => c.key === key)) return { ok: false, message: "Neznan korak." };
    const cur = { ...(row.checklist as Record<string, string>) };
    if (form.get("done") === "1") cur[key] = new Date().toISOString();
    else delete cur[key];
    await db.update(siteProjects).set({ checklist: cur }).where(eq(siteProjects.id, id));
    res = { ok: true, message: "Posodobljeno." };
  } else if (op === "facts") {
    const err = await updateSiteFacts(db, id, {
      domain: s(form, "domain"), contact: s(form, "contact"), features: s(form, "features"), deadline: s(form, "deadline"), notes: s(form, "notes"), ownerNotes: s(form, "ownerNotes"),
      hasCgp: form.get("hasCgp") === "on", languages: s(form, "languages").split(/[\s,;]+/).filter(Boolean),
    });
    res = err ? { ok: false, message: err } : { ok: true, message: "Shranjeno. Za zapis v repozitorij klikni »Osveži paket«." };
  } else if (op === "editors") {
    const lines = s(form, "editors").split("\n").map((l) => l.trim()).filter(Boolean);
    const editors = lines.map((l) => {
      const [email = "", role = "editor"] = l.split(/[\s,;]+/);
      return { email, role: role.toLowerCase() === "owner" ? ("owner" as const) : ("editor" as const) };
    });
    const err = await updateSiteFacts(db, id, { editors });
    res = err ? { ok: false, message: err } : { ok: true, message: "Uredniki shranjeni. Za zapis v repozitorij klikni »Osveži paket«." };
  } else if (op === "links") {
    const err = await setLinks(db, id, Object.fromEntries(["live", "dev", "preview", "design"].map((k) => [k, s(form, k)]).filter(([, v]) => v)));
    res = err ? { ok: false, message: err } : { ok: true, message: "Povezave shranjene." };
  }
  for (const p of [`/strani/${id}`, "/strani"]) revalidatePath(p);
  return res;
}
