import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/server/db/client";
import { companyCounts } from "@/server/places/list";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const c = await companyCounts(getDb());
  const stats: [string, number][] = [
    ["Podjetij v bazi", c.total],
    ["Dober posel (≥ 4,3, ≥ 30 ocen)", c.good],
    ["Brez lastne spletne strani", c.noWebsite],
  ];
  return (
    <>
      <PageHeader title="Danes" description="Pregled baze in naslednji koraki." />
      <div className="grid grid-cols-1 border border-border sm:grid-cols-3">
        {stats.map(([label, n], i) => (
          <div key={label} className={`bg-surface p-6 ${i < 2 ? "border-b border-border sm:border-b-0 sm:border-r" : ""}`}>
            <p className="font-mono text-3xl font-extrabold text-accent">{n}</p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 border border-border bg-surface p-6 font-mono text-xs text-text-secondary">
        <p>&gt; NASLEDNJE V RAZVOJU: RAZISKAVA STRANI, OCENA LEADOV, SEZNAM NAJBOLJŠIH 10</p>
        <p className="mt-3">
          <Link href="/iskanje" className="text-accent hover:underline">
            &gt; Poišči nova podjetja →
          </Link>
        </p>
      </div>
    </>
  );
}
