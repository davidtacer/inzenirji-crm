"use client";
import { useActionState } from "react";
import { saveMetaAction } from "./meta-actions";

const field = "w-full border border-border bg-black px-3 py-2 font-mono text-xs text-text-primary";

/** Settings card: Meta Ads read-only token + ad account for the weekly report (TASK-015). The token is never shown. */
export function MetaCard({ token, accountId }: { token: boolean; accountId: string | null }) {
  const [state, action, busy] = useActionState<{ ok: boolean; message: string } | null, FormData>(saveMetaAction, null);
  return (
    <form action={action} className="flex flex-col gap-3 font-sans text-xs text-text-secondary">
      <p>Poraba, kliki in leadi iz oglasov v tedenskem poročilu, iz tega tudi CAC (strošek oglasov na prodajo). CRM oglase samo bere.</p>
      <p>
        Žeton: {token ? <span className="text-accent">✓ nastavljen</span> : <span className="text-danger-text">✗ manjka</span>} · Račun:{" "}
        {accountId ? <span className="text-accent">act_{accountId}</span> : <span className="text-danger-text">✗ manjka</span>}
      </p>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-widest">{token ? "Nov žeton (pusti prazno, da ostane star)" : "Žeton (access token)"}</span>
        <input name="token" type="password" autoComplete="off" placeholder="EAA…" className={field} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-widest">ID oglasnega računa</span>
        <input name="accountId" defaultValue={accountId ? `act_${accountId}` : ""} placeholder="act_1234567890" className={field} />
      </label>
      <button type="submit" disabled={busy} className="w-fit border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-text-secondary hover:border-accent hover:text-accent">
        {busy ? "Preverjam…" : "Shrani in preveri"}
      </button>
      {state ? <p className={state.ok ? "text-accent" : "text-danger-text"}>&gt; {state.message}</p> : null}
    </form>
  );
}
