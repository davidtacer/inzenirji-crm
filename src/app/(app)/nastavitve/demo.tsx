"use client";
import { useActionState, useState } from "react";
import { createDemoTokenAction } from "./demo-actions";

/** Settings card: key for the public editor demo → CRM (TASK-032). The key is shown only right after creating it. */
export function DemoLeadsCard({ createdAt }: { createdAt: string | null }) {
  const [state, action, busy] = useActionState<{ token?: string; message: string } | null>(createDemoTokenAction, null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3 font-sans text-xs text-text-secondary">
      <p>
        Isti ključ uporabljata demo urejevalnika (e-naslovi obiskovalcev, vir »demo urejevalnika«) in obrazec na inzenirji.si (povpraševanja, vir »obrazec na strani«). CRM z njim bere tudi števila demota za stran Danes.
      </p>
      <p>
        Ključ:{" "}
        {createdAt ? <span className="text-accent">nastavljen ({createdAt})</span> : <span className="text-danger-text">še ni ustvarjen</span>}
      </p>
      {state?.token ? (
        <div className="flex flex-col gap-2 border border-accent/40 p-3">
          <p className="text-accent">&gt; {state.message}</p>
          <code className="break-all bg-black/40 p-2 font-mono text-[11px] text-text-primary">{state.token}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(state.token ?? "").then(() => setCopied(true));
            }}
            className="w-fit border border-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-accent hover:bg-accent hover:text-black"
          >
            {copied ? "Kopirano ✓" : "Kopiraj ključ"}
          </button>
          <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">Vpiši ga na dve mesti:</p>
          <ol className="list-decimal pl-4 leading-relaxed">
            <li>Urejevalnik: Cloudflare → Workers &amp; Pages → inzenirji-editor-dev → Settings → Variables and Secrets → Add → tip Secret → ime CRM_LEADS_TOKEN → vrednost: ta ključ → Deploy.</li>
            <li>
              Spletna stran: Vercel → projekt inzenirji.si → Settings → Environment Variables → Add: ime CRM_LEADS_TOKEN, vrednost: ta ključ, okolje Production → Save. Nato Deployments → zadnji → ⋯ → Redeploy.
            </li>
            <li>Ključ se po osvežitvi strani ne prikaže več. Če ga izgubiš, ustvari novega in ga vpiši na obe mesti znova.</li>
          </ol>
        </div>
      ) : state ? (
        <p className="text-danger-text">&gt; {state.message}</p>
      ) : null}
      <form action={action}>
        <button
          type="submit"
          disabled={busy}
          className="border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-text-secondary hover:border-accent hover:text-accent"
        >
          {createdAt ? "Ustvari nov ključ (stari preneha delovati)" : "Ustvari ključ"}
        </button>
      </form>
    </div>
  );
}
