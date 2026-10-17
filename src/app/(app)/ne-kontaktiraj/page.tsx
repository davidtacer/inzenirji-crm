import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { formatLj } from "@/lib/time";
import { listDnc } from "@/server/contact/dnc";
import { getDb } from "@/server/db/client";
import { AddDnc } from "./form";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { email: "E-naslov", domain: "Domena", company: "Podjetje" };

export default async function DncPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").slice(0, 100);
  const rows = await listDnc(getDb(), q);
  return (
    <>
      <PageHeader title="Ne kontaktiraj" description="Tem ljudem in podjetjem CRM nikoli več ne pošlje e-maila. Vpis je trajen (ADR-007)." />

      <section className="mb-6 border border-border bg-surface p-5">
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{"// Dodaj ročno"}</h2>
        <p className="mb-4 font-sans text-xs text-text-secondary">
          Če je kdo prosil po telefonu ali drugje. Odjave iz e-mailov (povezava »odjava« ali odgovor »ne«) in gumb »Ne kontaktiraj« na strani podjetja se vpišejo sami.
        </p>
        <AddDnc />
      </section>

      <form className="mb-4 flex gap-3">
        <input name="q" defaultValue={q} placeholder="Išči po naslovu, domeni, podjetju, razlogu" className="min-w-0 flex-1 border border-border bg-black px-3 py-2 font-mono text-xs text-text-primary" />
        <button type="submit" className="border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary hover:border-accent hover:text-accent">
          Išči
        </button>
      </form>

      <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">{q ? `Najdenih: ${rows.length}` : `Na seznamu: ${rows.length}`}</p>
      {rows.length === 0 ? (
        <p className="border border-border bg-surface p-5 font-mono text-xs text-text-secondary">&gt; {q ? "Ni zadetkov." : "Seznam je prazen."}</p>
      ) : (
        <ul className="border border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border bg-surface px-5 py-3 last:border-b-0">
              <span className="w-20 font-mono text-[10px] uppercase tracking-widest text-danger-text">{KIND[r.kind] ?? r.kind}</span>
              <span className="min-w-0 break-all font-sans text-sm text-text-primary">{r.kind === "company" ? (r.companyName ?? "izbrisano podjetje") : r.value}</span>
              {r.companyId && r.kind !== "company" ? (
                <Link href={`/podjetja/${r.companyId}`} className="font-mono text-xs text-text-secondary underline hover:text-accent">
                  {r.companyName}
                </Link>
              ) : r.companyId ? (
                <Link href={`/podjetja/${r.companyId}`} className="font-mono text-xs text-text-secondary underline hover:text-accent">
                  odpri
                </Link>
              ) : null}
              <span className="font-sans text-xs text-text-secondary">{r.reason}</span>
              <span className="ml-auto font-mono text-[10px] text-text-secondary">{formatLj(r.createdAt, false)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
