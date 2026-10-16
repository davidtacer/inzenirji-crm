"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getSettings } from "@/server/settings";
import { aiConfig } from "@/server/ai/remark";
import { researchBatch, runAudit } from "@/server/research/run";
import { runningJob, startJob } from "@/server/jobs";

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
