"use client";
import { useActionState } from "react";
import { historyAction, type ActionState } from "./actions";

export function HistoryButton({ companyId }: { companyId: string }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(historyAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="companyId" value={companyId} />
      <button
        type="submit"
        disabled={busy}
        className="border border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-text-secondary hover:border-text-primary hover:text-text-primary disabled:opacity-60"
      >
        {busy ? "Iščem v nabiralniku…" : "Uvozi korespondenco iz nabiralnika"}
      </button>
      {state ? <p role="status" className={`font-mono text-xs ${state.ok ? "text-accent" : "text-danger-text"}`}>&gt; {state.message}</p> : null}
    </form>
  );
}
