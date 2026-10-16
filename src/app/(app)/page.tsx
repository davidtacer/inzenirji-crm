import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ScoreBadge } from "@/components/ScoreBadge";
import { GROUP_HELP, GROUP_LABEL } from "@/lib/labels";
import { getDb } from "@/server/db/client";
import { companyCounts } from "@/server/places/list";
import { rescoreMissing, topLeads } from "@/server/scoring/apply";
import { pendingDraftCount } from "@/server/outreach/drafts";
import { DraftTopButton } from "./osnutki/forms";
import { DeepenButton } from "./podjetja/buttons";
import { shallowCount } from "@/server/research/run";
import { callsBoard } from "@/server/calls/calls";
import { formatLj, within } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = getDb();
  // Companies researched before scoring existed get their score once, here.
  await rescoreMissing(db, 200);
  const [c, top, pending, shallow, calls] = await Promise.all([companyCounts(db), topLeads(db, 10), pendingDraftCount(db), shallowCount(db), callsBoard(db)]);
  const soon = calls.booked.filter((b) => within(b.callAt, 36));
  const stats: [string, number][] = [
    ["Podjetij v bazi", c.total],
    ["Dober posel (≥ 4,3, ≥ 30 ocen)", c.good],
    ["Brez lastne spletne strani", c.noWebsite],
  ];
  return (
    <>
      <PageHeader title="Danes" description="Najboljši leadi za kontakt in pregled baze." />
      <div className="grid grid-cols-1 border border-border sm:grid-cols-3">
        {stats.map(([label, n], i) => (
          <div key={label} className={`bg-surface p-6 ${i < 2 ? "border-b border-border sm:border-b-0 sm:border-r" : ""}`}>
            <p className="font-mono text-3xl font-extrabold text-accent">{n}</p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">{label}</p>
          </div>
        ))}
      </div>

      {soon.length || calls.replied.length ? (
        <section className="mt-6 border border-accent/40 bg-surface">
          <h2 className="border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{"// Klici"}</h2>
          <ul>
            {soon.map((b) => (
              <li key={b.companyId} className="flex flex-wrap gap-x-4 border-b border-border px-5 py-3 last:border-b-0">
                <span className="font-mono text-xs text-accent">{formatLj(b.callAt)}</span>
                <Link href={`/podjetja/${b.companyId}`} className="font-sans text-sm text-text-primary hover:text-accent">
                  {b.name}
                </Link>
                <span className="font-mono text-[10px] text-text-secondary">{b.hasBrief ? "brief ✓" : "pripravi brief"}</span>
              </li>
            ))}
            {calls.replied.length ? (
              <li className="px-5 py-3 font-mono text-xs">
                <Link href="/klici" className="text-[#F0B429] hover:underline">
                  &gt; {calls.replied.length} odgovorilo — dogovori klic →
                </Link>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 border border-border bg-surface">
        <h2 className="border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
          {"// Najboljših 10 za kontakt"}
        </h2>
        {top.length === 0 ? (
          <p className="p-5 font-mono text-xs text-text-secondary">
            &gt; Še ni raziskanih podjetij.{" "}
            <Link href="/podjetja" className="text-accent hover:underline">
              Raziskuj podjetja →
            </Link>
          </p>
        ) : (
          <ol>
            {top.map((t, i) => (
              <li key={t.id} className="flex gap-4 border-b border-border px-5 py-4 last:border-b-0 hover:bg-surface2">
                <span className="w-5 shrink-0 pt-0.5 font-mono text-xs text-text-secondary">{i + 1}.</span>
                <ScoreBadge score={t.score} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-3">
                    <Link href={`/podjetja/${t.id}`} className="font-sans text-sm text-text-primary hover:text-accent">
                      {t.name}
                    </Link>
                    <span className="font-mono text-[10px] text-text-secondary">{[t.category, t.city].filter(Boolean).join(" · ")}</span>
                    {t.group ? (
                      <span title={GROUP_HELP[t.group]} className="font-mono text-[10px] text-accent">
                        {GROUP_LABEL[t.group]}
                      </span>
                    ) : null}
                    <span className={`font-mono text-[10px] ${t.hasEmail ? "text-accent" : "text-text-secondary"}`}>
                      {t.hasEmail ? "✉ E-NASLOV" : "BREZ E-NASLOVA"}
                    </span>
                    {t.hasDraft ? <span className="font-mono text-[10px] text-[#F0B429]">OSNUTEK PRIPRAVLJEN</span> : null}
                  </p>
                  {t.summary ? <p className="mt-1 line-clamp-2 font-sans text-xs text-text-secondary">{t.summary}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
        {top.length ? (
          <div className="flex flex-wrap items-center gap-4 border-t border-border px-5 py-4">
            {shallow > 0 ? <DeepenButton count={shallow} /> : null}
            <DraftTopButton />
            <Link href="/osnutki" className="font-mono text-xs text-accent hover:underline">
              &gt; Osnutki za odobritev: {pending} →
            </Link>
          </div>
        ) : null}
      </section>
    </>
  );
}
