import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { GROUP_LABEL } from "@/lib/labels";
import { callList } from "@/server/calls/calllist";
import { getDb } from "@/server/db/client";
import { CallLater } from "../podjetja/overview";

export const dynamic = "force-dynamic";

export default async function CallListPage() {
  const rows = await callList(getDb());
  return (
    <>
      <PageHeader
        title="Za klic"
        description="Podjetja brez veljavnega e-naslova ali ročno označena za klic. Ob vsakem je, kaj povedati. Po klicu zapiši zapiske na strani podjetja."
      />
      {rows.length === 0 ? (
        <p className="border border-border bg-surface p-5 font-mono text-xs text-text-secondary">&gt; Ni podjetij za klic.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => (
            <li key={r.companyId} className="border border-border bg-surface p-5">
              <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                {r.score !== null ? <span className="border border-accent px-2 font-mono text-xs text-accent">{r.score}</span> : null}
                <Link href={`/podjetja/${r.companyId}`} className="font-sans text-base text-text-primary hover:text-accent">
                  {r.name}
                </Link>
                <span className="font-mono text-[10px] text-text-secondary">{[r.category, r.city].filter(Boolean).join(" · ")}</span>
                {r.group ? <span className="font-mono text-[10px] text-accent">{GROUP_LABEL[r.group]}</span> : null}
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#F0B429]">{r.why === "manual" ? "ročno za klic" : "brez e-naslova"}</span>
                <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="ml-auto border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold tracking-widest text-black hover:bg-transparent hover:text-accent">
                  ☎ {r.phone}
                </a>
              </div>
              {r.summary ? <p className="mb-2 font-sans text-sm text-text-secondary">{r.summary}</p> : null}
              <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-text-secondary">Kaj povedati</p>
              <p className="mb-2 font-sans text-sm text-text-primary">
                Pozdravljeni, David iz inženirji.si. {r.remark}
              </p>
              {r.facts.length ? (
                <ul className="mb-3 list-disc pl-5 font-sans text-xs text-text-secondary">
                  {r.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/podjetja/${r.companyId}`} className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-text-secondary hover:border-accent hover:text-accent">
                  Odpri in zapiši klic
                </Link>
                <CallLater companyId={r.companyId} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
