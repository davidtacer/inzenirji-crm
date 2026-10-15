"use client";
import { useActionState } from "react";
import { researchBatchAction, researchOneAction, type ActionState } from "./actions";

const btn =
  "border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent disabled:opacity-60";

function Msg({ state }: { state: ActionState }) {
  return state ? <p role="status" className={`font-mono text-xs ${state.ok ? "text-accent" : "text-danger-text"}`}>&gt; {state.message}</p> : null;
}

export function ResearchBatchButton({ pending: count }: { pending: number }) {
  const [state, action, busy] = useActionState<ActionState>(researchBatchAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={busy || count === 0} className={btn}>
        {busy ? "Raziskujem… (do 1 min)" : `> Raziskuj neraziskana (${Math.min(count, 20)})`}
      </button>
      <Msg state={state} />
    </form>
  );
}

export function ResearchOneButton({ id, again }: { id: string; again: boolean }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(researchOneAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={busy} className={btn}>
        {busy ? "Raziskujem…" : again ? "> Raziskuj znova" : "> Raziskuj"}
      </button>
      <Msg state={state} />
    </form>
  );
}
