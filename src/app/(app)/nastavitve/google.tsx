"use client";
import { useActionState } from "react";
import { disconnectGoogleAction } from "./google-actions";

export function DisconnectGoogle() {
  const [state, action, busy] = useActionState<{ ok: boolean; message: string } | null>(disconnectGoogleAction, null);
  return (
    <form action={action} className="flex items-center gap-3">
      <button type="submit" disabled={busy} className="border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-text-secondary hover:border-danger-text hover:text-danger-text">
        Prekini povezavo
      </button>
      {state ? <span className="font-mono text-xs text-accent">&gt; {state.message}</span> : null}
    </form>
  );
}
