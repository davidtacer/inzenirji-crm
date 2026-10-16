"use client";
import { useActionState } from "react";
import { JobLine, type JobView } from "../podjetja/buttons";
import { sendReportAction, type ActionState } from "./actions";

export function SendReportButton({ week, job, again }: { week: string; job: JobView; again: boolean }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(sendReportAction, null);
  const running = job?.status === "running";
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="week" value={week} />
      <button type="submit" disabled={busy || running} className="border border-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-accent hover:bg-accent hover:text-black disabled:opacity-60">
        {busy || running ? "Pripravljam…" : again ? "> Osveži predloge in pošlji na e-mail" : "> Pripravi predloge in pošlji na e-mail"}
      </button>
      {job ? <JobLine job={job} label="Poročilo se pripravlja" /> : state ? <span className={`font-mono text-xs ${state.ok ? "text-accent" : "text-danger-text"}`}>&gt; {state.message}</span> : null}
    </form>
  );
}
