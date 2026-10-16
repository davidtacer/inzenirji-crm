"use client";
import { useActionState } from "react";
import { acceptAction, type AcceptState } from "./actions";

export function AcceptForm({ token }: { token: string }) {
  const [state, action, busy] = useActionState<AcceptState, FormData>(acceptAction, null);
  if (state?.ok) return <p className="border border-[#00FF41] p-4 font-mono text-sm text-[#00FF41]">&gt; {state.message}</p>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-[#888]">
        Ime in priimek
        <input name="name" required minLength={3} className="border border-[#222] bg-black px-3 py-2 font-sans text-sm text-[#EAEAEA] focus:border-[#00FF41] focus:outline-none" />
      </label>
      <label className="flex items-start gap-2 font-sans text-sm text-[#EAEAEA]">
        <input type="checkbox" name="agree" className="mt-1 h-4 w-4 accent-[#00FF41]" /> Strinjam se s ponudbo in pogoji.
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-fit border border-[#00FF41] bg-[#00FF41] px-5 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-[#00FF41]"
      >
        {busy ? "Potrjujem…" : "> Sprejemam ponudbo"}
      </button>
      {state && !state.ok ? <p className="font-mono text-xs text-[#FF3B3B]">&gt; {state.message}</p> : null}
    </form>
  );
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="border border-[#222] px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-[#888] hover:text-[#EAEAEA] print:hidden">
      Natisni / shrani PDF
    </button>
  );
}
