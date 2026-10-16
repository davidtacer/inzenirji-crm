import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { jobView } from "@/lib/jobs";
import { formatLj } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { demoFunnel } from "@/server/demo/demo";
import { latestJob } from "@/server/jobs";
import {
  collectWeek,
  eur,
  nextWeek,
  pct,
  previousWeek,
  ruleSuggestions,
  SOURCE_LABEL,
  storedReport,
  TARGETS,
  usd,
  type WeekData,
  weekLabel,
  weekStartOf,
} from "@/server/reports/weekly";
import { SendReportButton } from "./forms";

export const dynamic = "force-dynamic";

const JOB_LABEL: Record<string, string> = {
  remark: "Osebne opombe v e-mailih",
  reply: "Osnutki odgovorov",
  classify: "Razvrščanje odgovorov",
  web_search: "Iskanje po spletu",
  google_overview: "Google pregled (Gemini)",
  weekly_report: "Tedensko poročilo",
  brief: "Brief pred klicem",
  call_notes: "Povzetki klicev",
};

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-surface">
      <h2 className="border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{`// ${title}`}</h2>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Tile({ label, value, target, good }: { label: string; value: string; target: string; good: boolean | null }) {
  return (
    <div className="border-b border-border bg-surface p-5 sm:border-r">
      <p className={`font-mono text-3xl font-extrabold ${good === null ? "text-text-primary" : good ? "text-accent" : "text-[#F0B429]"}`}>{value}</p>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">{label}</p>
      <p className="mt-1 font-mono text-[10px] text-text-secondary">{target}</p>
    </div>
  );
}

function Line({ k, v, prev }: { k: string; v: number | string; prev?: number }) {
  const d = typeof v === "number" && prev !== undefined ? v - prev : null;
  return (
    <div className="flex items-baseline gap-4 border-b border-border py-2 last:border-b-0">
      <dt className="w-36 shrink-0 sm:w-52 font-mono text-[10px] uppercase tracking-widest text-text-secondary">{k}</dt>
      <dd className="font-sans text-sm text-text-primary">
        {v}
        {d !== null && d !== 0 ? <span className={`ml-2 font-mono text-[10px] ${d > 0 ? "text-accent" : "text-[#F0B429]"}`}>{`${d > 0 ? "+" : ""}${d} glede na prejšnji teden`}</span> : null}
      </dd>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const db = getDb();
  const now = new Date();
  const current = weekStartOf(now);
  const q = (await searchParams).w;
  const ws = q && /^\d{4}-\d{2}-\d{2}$/.test(q) && q <= current ? weekStartOf(new Date(`${q}T12:00:00Z`)) : current;
  const stored = await storedReport(db, ws);
  const live = ws === current || !stored;
  const editorStats = ws === current ? async (days: number) => ({ stats: (await demoFunnel(db, undefined, days)).editor, error: null }) : undefined;
  const d: WeekData = live ? await collectWeek(db, ws, { now, editorStats }) : stored.data;
  const prevStored = await storedReport(db, previousWeek(ws));
  const prev = prevStored?.data ?? (await collectWeek(db, previousWeek(ws), { now }));
  const job = jobView(await latestJob(db, ["weekly_report"]));
  const sug = stored?.suggestions?.length ? stored.suggestions : ruleSuggestions(d);
  const demoPct = d.demo.stats ? pct(d.demo.stats.emails, d.demo.stats.visits) : null;

  return (
    <>
      <PageHeader title="Poročila" description="Tedensko poročilo iz CRM-ja. Vsak ponedeljek ob 8h pride tudi na tvoj e-naslov." />

      <nav className="mb-4 flex flex-wrap items-center gap-4 font-mono text-xs">
        <Link href={`/porocila?w=${previousWeek(ws)}`} className="text-text-secondary hover:text-accent">
          ← prejšnji teden
        </Link>
        <span className="text-text-primary">
          {weekLabel(ws)}
          {d.partial ? <span className="ml-2 text-[#F0B429]">· teden še teče</span> : null}
        </span>
        {ws < current ? (
          <>
            <Link href={`/porocila?w=${nextWeek(ws)}`} className="text-text-secondary hover:text-accent">
              naslednji teden →
            </Link>
            <Link href="/porocila" className="text-text-secondary hover:text-accent">
              ta teden
            </Link>
          </>
        ) : null}
      </nav>

      <div className="grid grid-cols-2 border-l border-t border-border lg:grid-cols-3">
        <Tile label="Novi leadi" value={String(d.leads)} target={`cilj ${TARGETS.leadsPerWeek}+ na teden`} good={d.leads >= TARGETS.leadsPerWeek} />
        <Tile label="Klici" value={String(d.calls)} target={`cilj ${TARGETS.callsPerWeek}–8 na teden`} good={d.calls >= TARGETS.callsPerWeek} />
        <Tile label={`Prodaje v mesecu (${d.monthLabel})`} value={String(d.monthSales)} target={`cilj ${TARGETS.salesPerMonth} na mesec`} good={d.monthSales >= TARGETS.salesPerMonth} />
        <Tile
          label="Čas do odgovora"
          value={d.replyHoursMedian === null ? "-" : `${String(d.replyHoursMedian).replace(".", ",")} h`}
          target="mediana, cilj pod 1 h"
          good={d.replyHoursMedian === null ? null : d.replyHoursMedian <= TARGETS.replyHours}
        />
        <Tile label="Demo → e-naslov" value={demoPct === null ? "-" : `${demoPct} %`} target={`cilj nad ${TARGETS.demoEmailPct} %`} good={demoPct === null ? null : demoPct >= TARGETS.demoEmailPct} />
        <Tile label="Stroški AI" value={usd(d.ai.microUsd)} target="CAC, ko bodo povezani oglasi" good={null} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Box title="Ta teden">
          <dl>
            <Line k="Novi leadi" v={d.leads} prev={prev.leads} />
            <Line k="Raziskana podjetja" v={d.researched} prev={prev.researched} />
            <Line k="Prvi e-maili" v={d.outreach.first} prev={prev.outreach.first} />
            <Line k="Opomniki" v={d.outreach.followups} prev={prev.outreach.followups} />
            <Line k="Odgovori" v={d.outreach.replies} prev={prev.outreach.replies} />
            <Line k="  od tega zainteresiranih" v={d.outreach.interested} prev={prev.outreach.interested} />
            <Line k="Delež odgovorov" v={`${pct(d.outreach.replies, d.outreach.first)} % od prvih e-mailov`} />
            <Line k="Klici" v={d.calls} prev={prev.calls} />
            <Line k="Ponudbe poslane" v={d.proposals.sent} prev={prev.proposals.sent} />
            <Line k="Ponudbe potrjene" v={d.proposals.accepted} prev={prev.proposals.accepted} />
            <Line k="Vrednost potrjenih" v={`${eur(d.proposals.acceptedNetCents)} brez DDV`} />
            <Line k="Plačila (označena)" v={`${d.paid.count} · ${eur(d.paid.cents)}`} />
            <Line k="Objavljene strani" v={d.launched.count ? `${d.launched.count}, v roku ${d.launched.onTime}` : "0"} />
            <Line k="Odjave / nedostavljeni" v={`${d.outreach.optOuts} / ${d.outreach.bounces}`} />
          </dl>
        </Box>

        <Box title="3 predlogi za naslednji teden">
          <ol className="mb-4 list-decimal space-y-2 pl-5 font-sans text-sm text-text-primary">
            {sug.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="mb-4 font-mono text-[10px] text-text-secondary">
            {stored?.suggestions?.length ? (stored.suggestionsBy === "rules" ? "Predlogi po pravilih." : `Predlogi: AI (${stored.suggestionsBy}), ${formatLj(stored.generatedAt)}.`) : "Predlogi po pravilih. AI predloge pripravi gumb spodaj ali ponedeljkovo poročilo."}
            {stored?.sentAt ? ` Poslano na e-mail ${formatLj(stored.sentAt)}.` : ""}
            {stored?.sendError ? <span className="text-danger-text">{` E-mail ni bil poslan: ${stored.sendError}`}</span> : null}
          </p>
          <SendReportButton week={ws} job={job} again={!!stored} />
        </Box>

        <Box title="Po kanalih (ta teden)">
          {d.channels.length ? (
            <div className="overflow-x-auto">
              <table className="w-full font-sans text-sm">
                <thead>
                  <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                    <th className="py-2 pr-3 font-normal">Kanal</th>
                    <th className="py-2 pr-3 font-normal">Novi</th>
                    <th className="py-2 pr-3 font-normal">E-mail</th>
                    <th className="py-2 pr-3 font-normal">Odgovor</th>
                    <th className="py-2 pr-3 font-normal">Klic</th>
                    <th className="py-2 pr-3 font-normal">Ponudba</th>
                    <th className="py-2 font-normal">Prodaja</th>
                  </tr>
                </thead>
                <tbody>
                  {d.channels.map((c) => (
                    <tr key={c.source} className="border-t border-border">
                      <td className="py-2 pr-3 text-text-primary">{SOURCE_LABEL[c.source] ?? c.source}</td>
                      <td className="py-2 pr-3">{c.leads}</td>
                      <td className="py-2 pr-3">{c.contacted}</td>
                      <td className="py-2 pr-3">{c.replies}</td>
                      <td className="py-2 pr-3">{c.calls}</td>
                      <td className="py-2 pr-3">{c.proposals}</td>
                      <td className="py-2 text-accent">{c.won}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="font-mono text-xs text-text-secondary">&gt; Ta teden še ni aktivnosti.</p>
          )}
        </Box>

        <Box title="Demo urejevalnika">
          <dl>
            {d.demo.stats ? (
              <>
                <Line k={`Obiski (zadnjih ${d.demo.days} dni)`} v={d.demo.stats.visits} />
                <Line k="Urejali" v={d.demo.stats.edited} />
                <Line k="Pustili e-naslov" v={`${d.demo.stats.emails} (${pct(d.demo.stats.emails, d.demo.stats.visits)} %)`} />
              </>
            ) : (
              <p className="mb-2 font-mono text-xs text-text-secondary">&gt; Obiski demota: {ws === current || stored ? (d.demo.error ?? "ni podatka") : "samo v shranjenem poročilu"}.</p>
            )}
            <Line k="Prišli v CRM" v={d.demo.leads} prev={prev.demo.leads} />
          </dl>
          <p className="mt-3 font-mono text-[10px] text-text-secondary">
            Podjetja iz demota: <Link href="/podjetja?source=editor_demo&sort=new" className="underline hover:text-accent">Podjetja → Iz demota</Link>
          </p>
        </Box>

        <Box title="Kaj dobi odgovore (zadnji 4 tedni)">
          {d.worked.categories.length ? (
            <>
              <ul className="mb-4 space-y-1 font-sans text-sm">
                {d.worked.categories.slice(0, 10).map((c) => (
                  <li key={c.label} className="flex gap-3">
                    <span className="min-w-0 flex-1 truncate text-text-primary">{c.label}</span>
                    <span className="font-mono text-xs text-text-secondary">
                      {c.replies}/{c.sent}
                    </span>
                    <span className={`w-12 text-right font-mono text-xs ${c.replies ? "text-accent" : "text-text-secondary"}`}>{pct(c.replies, c.sent)} %</span>
                  </li>
                ))}
              </ul>
              <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                Ponudba:{" "}
                {d.worked.groups.map((g) => `${g.label === "A" ? "A (prenova)" : g.label === "B" ? "B (nova stran)" : g.label} ${g.replies}/${g.sent}`).join(" · ")}
              </p>
            </>
          ) : (
            <p className="font-mono text-xs text-text-secondary">&gt; V zadnjih 4 tednih še ni poslanih prvih e-mailov.</p>
          )}
        </Box>

        <Box title="Stroški">
          <dl>
            {Object.entries(d.ai.byJob)
              .sort((a, b) => b[1] - a[1])
              .map(([job, micro]) => (
                <Line key={job} k={JOB_LABEL[job] ?? job} v={usd(micro)} />
              ))}
            <Line k="AI skupaj" v={usd(d.ai.microUsd)} />
            <Line k="Google Places klici" v={d.placesCalls} />
          </dl>
          <p className="mt-3 font-mono text-[10px] text-text-secondary">Meta oglasi, Google Analytics in Search Console pridejo s TASK-015.</p>
        </Box>
      </div>
    </>
  );
}
