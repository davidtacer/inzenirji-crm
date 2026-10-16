"use client";
import { useActionState } from "react";
import { saveGeminiAction } from "./gemini-actions";

const field = "w-full border border-border bg-black px-3 py-2 font-mono text-xs text-text-primary";

/** Settings card: Gemini API key for "Google pregled" (TASK-037). The key is never shown again. */
export function GeminiCard({ set, model }: { set: boolean; model: string }) {
  const [state, action, busy] = useActionState<{ ok: boolean; message: string } | null, FormData>(saveGeminiAction, null);
  return (
    <form action={action} className="flex flex-col gap-3 font-sans text-xs text-text-secondary">
      <p>Gumb »Google pregled« na strani podjetja: Gemini poišče podjetje na Googlu, ti z enim klikom shraniš, kar je pravilno.</p>
      <p>
        Ključ: {set ? <span className="text-accent">✓ nastavljen</span> : <span className="text-danger-text">✗ manjka</span>}
      </p>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-widest">{set ? "Nov ključ (pusti prazno, da ostane star)" : "Gemini API ključ"}</span>
        <input name="apiKey" type="password" autoComplete="off" placeholder="AIza…" className={field} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-widest">Model</span>
        <input name="model" defaultValue={model} className={field} />
      </label>
      <button type="submit" disabled={busy} className="w-fit border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-text-secondary hover:border-accent hover:text-accent">
        {busy ? "…" : "Shrani"}
      </button>
      {state ? <p className={state.ok ? "text-accent" : "text-danger-text"}>&gt; {state.message}</p> : null}
    </form>
  );
}
