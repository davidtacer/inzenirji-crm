"use client";
import { useActionState } from "react";
import { type AddState, addDncAction } from "./actions";

const field = "border border-border bg-black px-3 py-2 font-mono text-xs text-text-primary";

export function AddDnc() {
  const [state, action, busy] = useActionState<AddState, FormData>(addDncAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <input name="value" required placeholder="ime@podjetje.si ali podjetje.si" className={`${field} min-w-0 flex-1`} />
        <input name="reason" placeholder="Razlog (npr. prosil po telefonu)" className={`${field} min-w-0 flex-1`} />
      </div>
      <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
        <input type="checkbox" name="confirm" className="h-4 w-4 accent-[#FF3B3B]" /> Trajno, ni mogoče razveljaviti
      </label>
      <button type="submit" disabled={busy} className="w-fit border border-danger-text px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-danger-text hover:bg-danger-text hover:text-black disabled:opacity-60">
        {busy ? "…" : "> Dodaj na seznam"}
      </button>
      {state ? <p className={`font-mono text-xs ${state.ok ? "text-accent" : "text-danger-text"}`}>&gt; {state.message}</p> : null}
    </form>
  );
}
