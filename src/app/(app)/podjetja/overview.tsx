"use client";
import { useActionState } from "react";
import { addLinkAction, googleOverviewAction, setTestAction, setWebsiteAction, type ActionState } from "./actions";
import { JobLine, type JobView } from "./buttons";

const small = "border border-accent/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-accent hover:bg-accent hover:text-black disabled:opacity-50";

export function OverviewButton({ id, job, has, configured }: { id: string; job: JobView; has: boolean; configured: boolean }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(googleOverviewAction, null);
  const running = job?.status === "running";
  if (!configured) return <p className="font-mono text-xs text-text-secondary">&gt; Za Google pregled vpiši ključ za Gemini v Nastavitvah.</p>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={busy || running} className="border border-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-accent hover:bg-accent hover:text-black disabled:opacity-60">
        {busy || running ? "Iščem na Googlu…" : has ? "> Nov Google pregled" : "> Google pregled"}
      </button>
      {job ? <JobLine job={job} /> : state ? <span className="font-mono text-xs text-accent">&gt; {state.message}</span> : null}
    </form>
  );
}

export function AddLink({ companyId, url, kind }: { companyId: string; url: string; kind: string }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(addLinkAction, null);
  if (state?.ok) return <span className="font-mono text-[10px] text-accent">✓ dodano</span>;
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="url" value={url} />
      <input type="hidden" name="kind" value={kind} />
      <button type="submit" disabled={busy} className={small}>
        {busy ? "…" : "Dodaj povezavo"}
      </button>
    </form>
  );
}

export function SetWebsite({ companyId, url }: { companyId: string; url: string }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(setWebsiteAction, null);
  if (state?.ok) return <span className="font-mono text-[10px] text-accent">✓ {state.message}</span>;
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="url" value={url} />
      <button type="submit" disabled={busy} className={small}>
        {busy ? "…" : "Nastavi kot spletno stran"}
      </button>
    </form>
  );
}

/** Owner pastes a link he opened himself (e.g. from Google's sources) and saves it (TASK-037). */
export function PasteLink({ companyId }: { companyId: string }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(addLinkAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="companyId" value={companyId} />
      <input name="url" type="url" required placeholder="https://… (prilepi naslov strani, ki si jo odprl)" className="min-w-0 flex-1 border border-border bg-transparent px-2 py-1 font-sans text-sm text-text-primary" />
      <button type="submit" disabled={busy} className={small}>
        {busy ? "…" : "Dodaj povezavo"}
      </button>
      {state ? <span className={`font-mono text-[10px] ${state.ok ? "text-accent" : "text-danger-text"}`}>{state.ok ? "✓ dodano" : state.message}</span> : null}
    </form>
  );
}

/** "Testno podjetje" switch on the company page (TASK-016). */
export function TestToggle({ companyId, isTest }: { companyId: string; isTest: boolean }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(setTestAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="isTest" value={isTest ? "0" : "1"} />
      <button type="submit" disabled={busy} className={small}>
        {busy ? "…" : isTest ? "Ni testno" : "Označi kot testno"}
      </button>
      {state ? <span className={`font-mono text-[10px] ${state.ok ? "text-accent" : "text-danger-text"}`}>{state.message}</span> : null}
    </form>
  );
}
