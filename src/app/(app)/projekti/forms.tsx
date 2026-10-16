"use client";
import { useActionState } from "react";
import { projectAction, type ActionState } from "./actions";

const btn =
  "border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent disabled:opacity-60";
const ghost = "border border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-text-secondary hover:border-text-primary hover:text-text-primary disabled:opacity-60";
const input = "w-full border border-border bg-black px-3 py-2 font-sans text-sm text-text-primary focus:border-accent focus:outline-none";

function Msg({ s }: { s: ActionState }) {
  return s ? <p role="status" className={`font-mono text-xs ${s.ok ? "text-accent" : "text-danger-text"}`}>&gt; {s.message}</p> : null;
}

export function OpButton({ id, op, label, primary = false }: { id: string; op: string; label: string; primary?: boolean }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(projectAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <button type="submit" disabled={busy} className={primary ? btn : ghost}>
        {busy ? "…" : label}
      </button>
      <Msg s={state} />
    </form>
  );
}

export function PauseForm({ id }: { id: string }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(projectAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="pause" />
      <input name="reason" placeholder="Razlog (npr. čakam na besedila za Storitve)" className={input} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={ghost}>
          Ustavi rok
        </button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function ItemToggle({ id, index, done }: { id: string; index: number; done: boolean }) {
  const [, action, busy] = useActionState<ActionState, FormData>(projectAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="item" />
      <input type="hidden" name="index" value={index} />
      <input type="hidden" name="done" value={done ? "0" : "1"} />
      <button type="submit" disabled={busy} className={`h-5 w-5 border font-mono text-xs leading-none ${done ? "border-accent bg-accent text-black" : "border-border text-transparent hover:border-accent"}`} title={done ? "Označi kot manjkajoče" : "Označi kot prejeto"}>
        ✓
      </button>
    </form>
  );
}
