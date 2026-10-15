"use client";
import { useActionState } from "react";
import { syncAction, type ActionState } from "./actions";

export function SyncButton() {
  const [state, action, busy] = useActionState<ActionState>(syncAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={busy}
        className="border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent disabled:opacity-60"
      >
        {busy ? "Berem nabiralnik…" : "> Preveri nabiralnik"}
      </button>
      {state ? <p role="status" className={`font-mono text-xs ${state.ok ? "text-accent" : "text-danger-text"}`}>&gt; {state.message}</p> : null}
    </form>
  );
}
