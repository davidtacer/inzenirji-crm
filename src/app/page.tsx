import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { requireOwner } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { companyCounts } from "@/server/places/list";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireOwner();
  const c = await companyCounts(getDb());
  return (
    <>
      <AppHeader email={user.email} active="/" />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="font-mono text-4xl font-extrabold tracking-tightest">
          Danes<span className="terminal-cursor" aria-hidden />
        </h1>
        <div className="mt-8 grid grid-cols-1 border border-border sm:grid-cols-3">
          {[
            ["PODJETIJ V BAZI", c.total],
            ["DOBER POSEL (≥ 4,3, ≥ 30 OCEN)", c.good],
            ["BREZ SPLETNE STRANI", c.noWebsite],
          ].map(([label, n], i) => (
            <div key={String(label)} className={`p-6 ${i < 2 ? "border-b border-border sm:border-b-0 sm:border-r" : ""}`}>
              <p className="font-mono text-3xl font-extrabold text-accent">{n}</p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 border border-border bg-surface p-6 font-mono text-xs text-text-secondary">
          <p>&gt; NASLEDNJE V RAZVOJU: RAZISKAVA STRANI, OCENA LEADOV, SEZNAM NAJBOLJŠIH 10</p>
          <p className="mt-3">
            <Link href="/iskanje" className="text-accent hover:underline">
              &gt; Poišči nova podjetja →
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
