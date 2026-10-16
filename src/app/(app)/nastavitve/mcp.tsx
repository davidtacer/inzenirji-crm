"use client";
import { useActionState, useState } from "react";
import { createMcpTokenAction } from "./mcp-actions";

/** Settings card: connector URL for the nightly Claude researcher (TASK-036). Shown only right after creating it. */
export function McpCard({ createdAt }: { createdAt: string | null }) {
  const [state, action, busy] = useActionState<{ url?: string; message: string } | null>(createMcpTokenAction, null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3 font-sans text-xs text-text-secondary">
      <p>Claude vsako noč vzame podjetja iz CRM, jih razišče na spletu in ugotovitve zapiše nazaj. Strošek gre iz tvoje Claude naročnine, ne iz API računa.</p>
      <p>
        Povezava: {createdAt ? <span className="text-accent">ustvarjena ({createdAt})</span> : <span className="text-danger-text">še ni ustvarjena</span>}
      </p>
      {state?.url ? (
        <div className="flex flex-col gap-2 border border-accent/40 p-3">
          <p className="text-accent">&gt; {state.message}</p>
          <code className="break-all bg-black/40 p-2 font-mono text-[11px] text-text-primary">{state.url}</code>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(state.url ?? "").then(() => setCopied(true))}
            className="w-fit border border-accent px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-accent hover:bg-accent hover:text-black"
          >
            {copied ? "Kopirano ✓" : "Kopiraj naslov"}
          </button>
          <ol className="list-decimal pl-4 leading-relaxed">
            <li>claude.ai → levo spodaj tvoje ime → Settings → Connectors.</li>
            <li>Add custom connector → Name: Inženirji CRM → Remote MCP server URL: ta naslov → Add.</li>
            <li>Naslov je skrivnost (kdor ga ima, bere CRM). Ne deli ga. Nov naslov zamenja starega.</li>
          </ol>
        </div>
      ) : state ? (
        <p className="text-danger-text">&gt; {state.message}</p>
      ) : null}
      <form action={action}>
        <button type="submit" disabled={busy} className="border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-text-secondary hover:border-accent hover:text-accent">
          {createdAt ? "Ustvari nov naslov (stari preneha delovati)" : "Ustvari naslov za Claude"}
        </button>
      </form>
    </div>
  );
}
