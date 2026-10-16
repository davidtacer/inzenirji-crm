import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { GROUP_LABEL } from "@/lib/labels";
import { formatLj, isPast } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { callsBoard, type CallSummary } from "@/server/calls/calls";

export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<typeof callsBoard>>["booked"][number];

function Item({ r, extra }: { r: Row; extra?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface px-5 py-3 last:border-b-0">
      <Link href={`/podjetja/${r.companyId}`} className="font-sans text-sm text-text-primary hover:text-accent">
        {r.name}
      </Link>
      <span className="font-mono text-[10px] text-text-secondary">{[r.category, r.city].filter(Boolean).join(" · ")}</span>
      {r.group ? <span className="font-mono text-[10px] text-accent">{GROUP_LABEL[r.group]}</span> : null}
      {r.phone ? (
        <a href={`tel:${r.phone.replace(/\s/g, "")}`} className="font-mono text-xs text-text-secondary hover:text-accent">
          {r.phone}
        </a>
      ) : null}
      <span className="ml-auto font-mono text-xs">{extra}</span>
    </li>
  );
}

function Section({ title, rows, empty, extra }: { title: string; rows: Row[]; empty: string; extra: (r: Row) => React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{`// ${title} (${rows.length})`}</h2>
      {rows.length ? (
        <ul className="border border-border">
          {rows.map((r) => (
            <Item key={r.companyId} r={r} extra={extra(r)} />
          ))}
        </ul>
      ) : (
        <p className="border border-border bg-surface p-4 font-mono text-xs text-text-secondary">&gt; {empty}</p>
      )}
    </section>
  );
}

export default async function CallsPage() {
  const b = await callsBoard(getDb());
  return (
    <>
      <PageHeader title="Klici" description="Od odgovora do ponudbe. Fazo in čas klica spremeniš na strani podjetja." />
      <Section
        title="Dogovorjeni klici"
        rows={b.booked}
        empty="Ni dogovorjenih klicev."
        extra={(r) => (
          <span className={isPast(r.callAt) ? "text-danger-text" : "text-accent"}>
            {formatLj(r.callAt)}
            {r.hasBrief ? " · brief ✓" : " · brief ✗"}
          </span>
        )}
      />
      <Section title="Odgovorili — dogovori klic" rows={b.replied} empty="Nihče ne čaka na dogovor." extra={() => <span className="text-[#F0B429]">dogovori termin</span>} />
      <Section
        title="Po klicu — pripravi ponudbo"
        rows={b.done}
        empty="Ni klicev, ki čakajo na ponudbo."
        extra={(r) => <span className="text-text-secondary">{(r.summary as CallSummary | null)?.nextStep || "ponudba"}</span>}
      />
    </>
  );
}
