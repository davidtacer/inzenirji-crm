"use client";
import { useActionState } from "react";
import { releaseHeldAction, type ActionState } from "./actions";

export function ReleaseHeldButton({ id }: { id: string }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(releaseHeldAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={busy}
        className="border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {busy ? "Prenašam…" : "Ni smeti - prenesi v CRM"}
      </button>
      {state ? <span className={`font-mono text-xs ${state.ok ? "text-accent" : "text-danger-text"}`}>&gt; {state.message}</span> : null}
    </form>
  );
}
