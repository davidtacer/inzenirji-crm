import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { GROUP_LABEL } from "@/lib/labels";
import { formatLj, isPast } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { callsBoard, type CallSummary } from "@/server/calls/calls";
import { syncCalendar, unmatchedBookings } from "@/server/google/calendar";

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
  const db = getDb();
  // Read the calendar when the page opens, at most every 2 minutes.
  const cal = await syncCalendar(db, { minAgeMs: 120_000 });
  const [b, unknown] = await Promise.all([callsBoard(db), unmatchedBookings(db)]);
  return (
    <>
      <PageHeader title="Klici" description="Od odgovora do ponudbe. Rezervacije iz Google Koledarja se vpišejo same; ročno spremeniš fazo na strani podjetja." />
      {cal.ok === false ? <p className="mb-4 font-mono text-xs text-danger-text">&gt; {cal.message}</p> : null}
      {unknown.length ? (
        <section className="mb-8">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[#F0B429]">{`// Rezervacije oseb, ki jih ni v CRM (${unknown.length})`}</h2>
          <ul className="border border-border">
            {unknown.map((e) => (
              <li key={e.eventId} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface px-5 py-3 last:border-b-0">
                <span className="font-mono text-xs text-accent">{formatLj(e.startAt)}</span>
                <span className="font-sans text-sm text-text-primary">{e.summary || "(brez naslova)"}</span>
                <span className="font-mono text-xs text-text-secondary">{e.attendees}</span>
                <Link
                  href={`/podjetja/novo?email=${encodeURIComponent(e.attendees.split(",")[0].trim())}`}
                  className="ml-auto font-mono text-xs text-accent hover:underline"
                >
                  + dodaj podjetje
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
