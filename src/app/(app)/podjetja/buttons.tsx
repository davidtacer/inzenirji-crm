"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { deepenAction, researchBatchAction, researchOneAction, type ActionState } from "./actions";

const btn =
  "border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent disabled:opacity-60";

/** A background job as the page saw it (TASK-035). */
export type JobView = { status: string; message: string | null; done: number; total: number; failed: number } | null;

/** Shows a running job (with progress) and refreshes the page every 5 s until it ends; then its final message. */
export function JobLine({ job, label = "Raziskava teče v ozadju" }: { job: JobView; label?: string }) {
  const router = useRouter();
  const running = job?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [running, router]);
  if (!job) return null;
  if (running)
    return (
      <p role="status" className="font-mono text-xs text-[#F0B429]">
        &gt; {label}{job.total ? ` · ${job.done + job.failed}/${job.total}` : ""} … stran se osveži sama.
      </p>
    );
  return job.message ? <p role="status" className={`font-mono text-xs ${job.status === "done" ? "text-accent" : "text-danger-text"}`}>&gt; {job.message}</p> : null;
}

function Msg({ state }: { state: ActionState }) {
  return state ? <p role="status" className={`font-mono text-xs ${state.ok ? "text-accent" : "text-danger-text"}`}>&gt; {state.message}</p> : null;
}

export function ResearchBatchButton({ pending: count, job }: { pending: number; job: JobView }) {
  const [state, action, busy] = useActionState<ActionState>(researchBatchAction, null);
  const running = job?.status === "running";
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={busy || running || count === 0} className={btn}>
        {busy || running ? "Raziskujem…" : `> Raziskuj neraziskana (${Math.min(count, 20)})`}
      </button>
      {job ? <JobLine job={job} /> : <Msg state={state} />}
    </form>
  );
}

export function ResearchOneButton({ id, again, job }: { id: string; again: boolean; job: JobView }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(researchOneAction, null);
  const running = job?.status === "running";
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={busy || running} className={btn}>
        {busy || running ? "Raziskujem…" : again ? "> Raziskuj znova" : "> Raziskuj"}
      </button>
      {job ? <JobLine job={job} /> : <Msg state={state} />}
    </form>
  );
}

export function DeepenButton({ count, job }: { count: number; job: JobView }) {
  const [state, action, busy] = useActionState<ActionState>(deepenAction, null);
  const running = job?.status === "running";
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={busy || running || count === 0} className={btn}>
        {busy || running ? "Raziskujem poglobljeno…" : `> Poglobi raziskavo (${Math.min(count, 20)} najboljših)`}
      </button>
      {job ? <JobLine job={job} /> : <Msg state={state} />}
    </form>
  );
}
