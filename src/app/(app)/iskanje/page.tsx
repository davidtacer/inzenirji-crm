import Link from "next/link";
import { CompanyTable } from "@/components/CompanyTable";
import { PageHeader } from "@/components/PageHeader";
import { jobView } from "@/lib/jobs";
import { formatLj } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { latestJob } from "@/server/jobs";
import { ACTIVITIES, activityByKey, REGIONS, regionOf } from "@/server/places/catalog";
import { latestCompanies } from "@/server/places/list";
import { callsToday } from "@/server/places/quota";
import { PLACES_PROVIDER } from "@/server/places/search";
import { lastActivity, nextTowns, searchHistory } from "@/server/places/smart";
import { getSettings } from "@/server/settings";
import { SearchForm } from "./search-form";
import { SmartSearchForm } from "./smart-form";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ d?: string; k?: string }> }) {
  const db = getDb();
  const sp = await searchParams;
  const [rows, used, st, history, last, job] = await Promise.all([
    latestCompanies(db),
    callsToday(db, PLACES_PROVIDER),
    getSettings(db),
    searchHistory(db),
    lastActivity(db),
    latestJob(db, ["smart_search"], undefined, 60 * 60_000),
  ]);
  const activity = sp.d && activityByKey(sp.d) ? sp.d : (last?.activity ?? ACTIVITIES[0]!.key);
  const town = sp.k && regionOf(sp.k) ? sp.k : (last?.town ?? "Maribor");
  const next = await nextTowns(db, activity);
  const cap = st.placesDailyCap;
  return (
    <>
      <PageHeader
        title="Iskanje strank"
        description="Izberi dejavnost in kraj, CRM poišče čim več novih podjetij. Podvojena podjetja se samo posodobijo."
        right={
          <p className="border border-border bg-surface px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
            Google Places danes: <span className="text-accent">{used}</span> / {cap} klicev
          </p>
        }
      />
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{"// Pametno iskanje"}</h2>
      <SmartSearchForm key={`${activity}-${town}`} activities={ACTIVITIES} regions={REGIONS} activity={activity} town={town} job={jobView(job)} />

      {next.length ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
          Še neiskano za {activityByKey(activity)?.label.toLowerCase()}:
          {next.map((t) => (
            <Link key={t} href={`/iskanje?d=${activity}&k=${encodeURIComponent(t)}`} className="border border-border px-2 py-0.5 normal-case tracking-normal text-text-primary hover:border-accent hover:text-accent">
              {t}
            </Link>
          ))}
        </p>
      ) : null}

      <h2 className="mb-3 mt-10 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{"// Že iskano"}</h2>
      {history.length ? (
        <div className="overflow-x-auto border border-border bg-surface">
          <table className="w-full font-sans text-sm">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                <th className="px-4 py-2 font-normal">Dejavnost</th>
                <th className="px-4 py-2 font-normal">Kraj / iskanje</th>
                <th className="px-4 py-2 font-normal">Poizvedb</th>
                <th className="px-4 py-2 font-normal">Najdenih</th>
                <th className="px-4 py-2 font-normal">Novih</th>
                <th className="px-4 py-2 font-normal">Zadnjič</th>
                <th className="px-4 py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={`${h.activity}-${h.town}`} className="border-t border-border">
                  <td className="px-4 py-2 text-text-primary">{h.activity ? (activityByKey(h.activity)?.label ?? h.activity) : <span className="text-text-secondary">ročno</span>}</td>
                  <td className="px-4 py-2">{h.town}</td>
                  <td className="px-4 py-2">{h.queries}</td>
                  <td className="px-4 py-2">{h.found}</td>
                  <td className="px-4 py-2 text-accent">{h.created}</td>
                  <td className="px-4 py-2 font-mono text-xs text-text-secondary">{formatLj(h.last, false)}</td>
                  <td className="px-4 py-2">
                    {h.activity && h.town ? (
                      h.lastCreated === 0 ? (
                        <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">izčrpano</span>
                      ) : (
                        <Link href={`/iskanje?d=${h.activity}&k=${encodeURIComponent(h.town)}`} className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline">
                          išči še
                        </Link>
                      )
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="border border-border bg-surface p-5 font-mono text-xs text-text-secondary">&gt; Še ni iskanj.</p>
      )}

      <details className="mt-8">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.3em] text-text-secondary hover:text-accent">{"// Ročno iskanje (poljubno besedilo)"}</summary>
        <div className="mt-3">
          <SearchForm />
        </div>
      </details>

      <h2 className="mb-3 mt-10 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{"// Zadnja podjetja"}</h2>
      <CompanyTable rows={rows} />
    </>
  );
}
