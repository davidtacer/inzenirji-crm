"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { runningJob, startJob } from "@/server/jobs";
import { reportDeps } from "@/server/reports/schedule";
import { makeReport } from "@/server/reports/weekly";

export type ActionState = { ok: boolean; message: string } | null;

/** Owner: make this week's report now (numbers + 3 proposals) and e-mail it (TASK-016). Runs in the background. */
export async function sendReportAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getCurrentUser())) return { ok: false, message: "Prijava je potekla." };
  const ws = String(form.get("week") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ws)) return { ok: false, message: "Neveljaven teden." };
  const db = getDb();
  if (await runningJob(db, ["weekly_report"])) return { ok: false, message: "Poročilo se že pripravlja." };
  await startJob(db, { kind: "weekly_report" }, async () => {
    const r = await makeReport(db, ws, await reportDeps(db));
    return r.sentAt ? "Poročilo je pripravljeno in poslano na tvoj e-naslov." : `Poročilo je pripravljeno, e-mail ni bil poslan: ${r.sendError ?? "neznan razlog"}`;
  });
  revalidatePath("/porocila");
  return { ok: true, message: "Pripravljam poročilo …" };
}
