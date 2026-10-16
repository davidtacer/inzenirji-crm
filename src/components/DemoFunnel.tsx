import Link from "next/link";
import { formatLj } from "@/lib/time";
import { STAGE_LABEL } from "@/lib/labels";
import { getDb } from "@/server/db/client";
import { demoFunnel, recentDemoLeads } from "@/server/demo/demo";

/** "Danes": public editor demo funnel (30 days) and the newest demo leads (TASK-032). Streams in via Suspense. */
export async function DemoFunnel() {
  const db = getDb();
  const [f, leads] = await Promise.all([demoFunnel(db), recentDemoLeads(db)]);
  if (!f.editor && !leads.length && f.error?.startsWith("Ključ")) return null;
  const steps: [string, number | null][] = [
    ["Obiski demota", f.editor?.visits ?? null],
    ["Prva sprememba", f.editor?.edited ?? null],
    ["Pustili e-naslov", f.editor?.emails ?? null],
    ["Klic", f.calls],
  ];
  return (
    <section className="mt-6 border border-border bg-surface">
      <h2 className="border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{"// Demo urejevalnika · 30 dni"}</h2>
      <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
        {steps.map(([label, n], i) => (
          <div key={label} className={`p-4 ${i < 3 ? "sm:border-r" : ""} ${i % 2 === 0 ? "border-r sm:border-r" : ""} border-border`}>
            <p className="font-mono text-2xl font-extrabold text-accent">{n ?? "—"}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-text-secondary">{label}</p>
          </div>
        ))}
      </div>
      {f.error ? <p className="border-b border-border px-5 py-3 font-mono text-xs text-[#F0B429]">&gt; {f.error}</p> : null}
      {f.editor ? (
        <p className="border-b border-border px-5 py-2 font-mono text-[10px] text-text-secondary">
          Sprememb: {f.editor.edits} · strošek AI {(f.editor.costMicros / 1e6).toFixed(2).replace(".", ",")} €
        </p>
      ) : null}
      {leads.length ? (
        <ul>
          {leads.map((l) => (
            <li key={`${l.companyId}${l.at.toISOString()}`} className="border-b border-border px-5 py-3 last:border-b-0">
              <p className="flex flex-wrap items-baseline gap-x-3">
                <Link href={`/podjetja/${l.companyId}`} className="font-sans text-sm text-text-primary hover:text-accent">
                  {l.name}
                </Link>
                <span className="font-mono text-[10px] text-text-secondary">{formatLj(l.at)}</span>
                <span className="font-mono text-[10px] text-accent">{STAGE_LABEL[l.stage]}</span>
              </p>
              {l.requests.length ? <p className="mt-1 line-clamp-2 font-sans text-xs text-text-secondary">{l.requests.join(" · ")}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-3 font-mono text-xs text-text-secondary">&gt; Še ni leadov iz demota.</p>
      )}
    </section>
  );
}
