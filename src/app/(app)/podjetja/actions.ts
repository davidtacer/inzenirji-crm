"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getSettings } from "@/server/settings";
import { aiConfig } from "@/server/ai/remark";
import { researchBatch, runAudit } from "@/server/research/run";
import { runningJob, startJob } from "@/server/jobs";
import { linkKind, runOverview } from "@/server/research/overview";
import { companies, companyLinks } from "@/server/db/schema";
import { domainOf } from "@/server/contact/normalize";
import { eq } from "drizzle-orm";
import { markEmailInvalid, markEmailValid } from "@/server/contact/emails";
import { callLater, setChannel } from "@/server/calls/calllist";
import { rescoreCompany } from "@/server/scoring/apply";
import { updateCompanyDetails } from "@/server/companies/edit";

/** Research options from Nastavitve: Google Places cap, AI web search (TASK-031). */
async function researchDeps() {
  const st = await getSettings(getDb());
  return { places: await placesDeps(), directories: DIRECTORIES, webSearch: st.webSearchEnabled, ai: aiConfig(st) };
}

async function placesDeps() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  return apiKey ? { apiKey, dailyCap: (await getSettings(getDb())).placesDailyCap } : undefined;
}

// Production research also asks public directories for an e-mail (TASK-025).
const DIRECTORIES = true;

export type ActionState = { ok: boolean; message: string } | null;

/** Final message of a one-company research (shown when the background job ends). */
function researchMessage(r: Awaited<ReturnType<typeof runAudit>>) {
  return `Raziskano: skupina ${r.group}, težav ${r.issues}, e-naslovov ${r.emails}${r.directoryEmails ? ` (${r.directoryEmails} iz bizi.si)` : ""}${r.web ? `, splet: ${r.web.found} povezav${r.web.website ? " + spletna stran" : ""}${r.web.candidates ? `, ${r.web.candidates} e-naslovov za potrditev` : ""}` : ""}, konkurentov ${r.competitors}${r.competitorSource === "nearby" ? " (iz okolice)" : " (iz baze)"}.`;
}

const RUNNING = "Raziskava teče v ozadju (1–2 minuti na podjetje). Stran se osveži sama.";

/* Research runs as a background job (TASK-035): the request only starts it, the page shows progress. */
export async function researchOneAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran." };
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, message: "Neveljavno podjetje." };
  const db = getDb();
  if (await runningJob(db, ["research_one"], id)) return { ok: true, message: RUNNING };
  const deps = await researchDeps();
  await startJob(db, { kind: "research_one", companyId: id }, async () => researchMessage(await runAudit(db, id, deps)));
  revalidatePath(`/podjetja/${id}`);
  return { ok: true, message: RUNNING };
}

export async function researchBatchAction(_prev: ActionState): Promise<ActionState> {
  void _prev;
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran." };
  const db = getDb();
  if (await runningJob(db, ["research_batch", "research_deepen"])) return { ok: true, message: RUNNING };
  const deps = await researchDeps();
  await startJob(db, { kind: "research_batch" }, async (progress) => {
    const r = await researchBatch(db, { limit: 20, concurrency: 3, onProgress: progress, ...deps });
    if (r.done === 0 && r.failed === 0) return "Vsa podjetja so že raziskana.";
    return `Raziskanih ${r.done}${r.failed ? `, neuspešnih ${r.failed}` : ""}.`;
  });
  revalidatePath("/podjetja");
  return { ok: true, message: RUNNING };
}

export async function deepenAction(_prev: ActionState): Promise<ActionState> {
  void _prev;
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran." };
  const db = getDb();
  if (await runningJob(db, ["research_batch", "research_deepen"])) return { ok: true, message: RUNNING };
  const deps = await researchDeps();
  await startJob(db, { kind: "research_deepen" }, async (progress) => {
    const r = await researchBatch(db, { limit: 20, concurrency: 3, deepen: true, onProgress: progress, ...deps });
    if (r.done === 0 && r.failed === 0) return "Vsa raziskana podjetja so že poglobljeno raziskana.";
    return `Poglobljeno raziskanih ${r.done}${r.failed ? `, neuspešnih ${r.failed}` : ""}. Zdaj lahko znova pripraviš osnutke.`;
  });
  revalidatePath("/");
  return { ok: true, message: RUNNING };
}

/* ---------------- Google pregled (TASK-037) ---------------- */

export async function googleOverviewAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla. Osveži stran." };
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, message: "Neveljavno podjetje." };
  const db = getDb();
  if (await runningJob(db, ["google_overview"], id)) return { ok: true, message: "Google pregled teče …" };
  await startJob(db, { kind: "google_overview", companyId: id }, () => runOverview(db, id));
  revalidatePath(`/podjetja/${id}`);
  return { ok: true, message: "Google pregled teče …" };
}

/** Owner confirmed a link from the Google overview (TASK-037). */
export async function addLinkAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const id = String(form.get("companyId") ?? "");
  const url = String(form.get("url") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^https?:\/\/\S{3,990}$/.test(url)) return { ok: false, message: "Neveljavna povezava." };
  const kind = String(form.get("kind") || linkKind(url)).slice(0, 20);
  await getDb()
    .insert(companyLinks)
    .values({ companyId: id, url, kind, source: "owner", verified: true, note: "Google pregled (potrdil lastnik)" })
    .onConflictDoUpdate({ target: [companyLinks.companyId, companyLinks.url], set: { verified: true, kind } });
  revalidatePath(`/podjetja/${id}`);
  return { ok: true, message: "Dodano." };
}

/** Owner marks a company as his own test (demo, form, test sale): it stays, reports skip it (TASK-016). */
export async function setTestAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const id = String(form.get("companyId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, message: "Neveljavno podjetje." };
  const on = form.get("isTest") === "1";
  await getDb().update(companies).set({ isTest: on, updatedAt: new Date() }).where(eq(companies.id, id));
  revalidatePath(`/podjetja/${id}`);
  revalidatePath("/porocila");
  return { ok: true, message: on ? "Označeno kot testno: ne šteje več v poročila." : "Ni več testno: spet šteje v poročila." };
}

/** Owner corrects the company's name and basic details (ADR-051). */
export async function updateCompanyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const id = String(form.get("companyId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, message: "Neveljavno podjetje." };
  const f = (k: string) => String(form.get(k) ?? "");
  const r = await updateCompanyDetails(getDb(), id, { name: f("name"), phone: f("phone"), address: f("address"), city: f("city"), website: f("website"), category: f("category") });
  if (!r.ok) return r;
  revalidatePath(`/podjetja/${id}`);
  revalidatePath("/podjetja");
  return { ok: true, message: "Shranjeno." };
}

/** Owner confirmed the company's website from the Google overview (TASK-037). */
export async function setWebsiteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const id = String(form.get("companyId") ?? "");
  const url = String(form.get("url") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^https?:\/\/\S{3,990}$/.test(url)) return { ok: false, message: "Neveljavna povezava." };
  await getDb().update(companies).set({ website: url, websiteDomain: domainOf(url), updatedAt: new Date() }).where(eq(companies.id, id));
  revalidatePath(`/podjetja/${id}`);
  return { ok: true, message: "Nastavljeno. Klikni »Raziskuj znova«, da CRM pregleda stran." };
}

/* ---------- wrong e-mails and the phone channel (ADR-044) ---------- */

export async function markInvalidAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const id = String(form.get("companyId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, message: "Neveljavno podjetje." };
  const reason = String(form.get("reason") ?? "").trim() || "napačen";
  const r = await markEmailInvalid(getDb(), id, String(form.get("email") ?? ""), reason);
  await rescoreCompany(getDb(), id);
  revalidatePath(`/podjetja/${id}`);
  revalidatePath("/osnutki");
  revalidatePath("/za-klic");
  return r;
}

export async function markValidAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const id = String(form.get("companyId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, message: "Neveljavno podjetje." };
  const r = await markEmailValid(getDb(), id, String(form.get("email") ?? ""));
  await rescoreCompany(getDb(), id);
  revalidatePath(`/podjetja/${id}`);
  revalidatePath("/za-klic");
  return r;
}

export async function setChannelAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const id = String(form.get("companyId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, message: "Neveljavno podjetje." };
  const call = form.get("channel") === "call";
  await setChannel(getDb(), id, call ? "call" : null);
  revalidatePath(`/podjetja/${id}`);
  revalidatePath("/za-klic");
  revalidatePath("/osnutki");
  return { ok: true, message: call ? "Podjetje je v seznamu Za klic. Odprti e-maili zanj so preklicani." : "Spet kontakt po e-mailu." };
}

export async function callLaterAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const id = String(form.get("companyId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, message: "Neveljavno podjetje." };
  await callLater(getDb(), id, 2);
  revalidatePath("/za-klic");
  return { ok: true, message: "Pokažem znova čez 2 dni." };
}
