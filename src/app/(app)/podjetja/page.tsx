import Link from "next/link";
import { CompanyTable } from "@/components/CompanyTable";
import { GroupLegend } from "@/components/GroupLegend";
import { PageHeader } from "@/components/PageHeader";
import { STAGE_LABEL } from "@/lib/labels";
import { getDb } from "@/server/db/client";
import { companyCities, listCompanies, parseCompanyQuery, unresearchedCount } from "@/server/research/run";
import { ResearchBatchButton } from "./buttons";

export const dynamic = "force-dynamic";

const field = "border border-border bg-black px-3 py-2 font-sans text-sm text-text-primary focus:border-accent focus:outline-none";
const lab = "flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-text-secondary";
const STAGES = ["found", "researched", "contacted", "replied", "call_booked", "call_done", "proposal_sent", "won", "lost", "nurture"];

/** Quick presets (one click) on top of the full filter form. */
const PRESETS: [string, string][] = [
  ["", "Vsa"],
  ["good=1&sort=score", "Dober posel"],
  ["stage=found", "Neraziskana"],
  ["stage=researched&email=yes", "Pripravljena za e-mail"],
  ["stage=researched&email=no", "Brez e-naslova (za klic)"],
  ["group=A", "A · prenos"],
  ["group=B", "B · nova stran"],
];

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = parseCompanyQuery(sp);
  const db = getDb();
  const [rows, pending, cities] = await Promise.all([listCompanies(db, q), unresearchedCount(db), companyCities(db)]);
  const current = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1] && e[0] !== "f")).toString();
  return (
    <>
      <PageHeader
        title="Podjetja"
        description="Vsa najdena podjetja. Raziskava odpre njihovo stran in predlaga skupino A ali B."
        right={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/podjetja/novo"
              className="border border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-text-primary hover:border-accent hover:text-accent"
            >
              + Dodaj podjetje
            </Link>
            <ResearchBatchButton pending={pending} />
          </div>
        }
      />
      <GroupLegend />

      <div className="mb-3 flex flex-wrap gap-px border border-border bg-border">
        {PRESETS.map(([qs, label]) => (
          <Link
            key={label}
            href={qs ? `/podjetja?${qs}` : "/podjetja"}
            className={`px-4 py-2 font-mono text-[10px] uppercase tracking-widest ${qs === current ? "bg-accent text-black" : "bg-surface text-text-secondary hover:text-accent"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <form method="get" className="mb-4 grid grid-cols-2 gap-3 border border-border bg-surface p-4 md:grid-cols-4 xl:grid-cols-8">
        <label className={`${lab} col-span-2`}>
          Iskanje
          <input name="q" defaultValue={q.q ?? ""} placeholder="ime, kraj, panoga, e-naslov, domena, telefon" className={field} />
        </label>
        <label className={lab}>
          Faza
          <select name="stage" defaultValue={q.stage ?? ""} className={field}>
            <option value="">vse</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className={lab}>
          Skupina
          <select name="group" defaultValue={q.group ?? ""} className={field}>
            <option value="">vse</option>
            <option value="A">A · prenos</option>
            <option value="B">B · nova stran</option>
          </select>
        </label>
        <label className={lab}>
          Kraj
          <select name="city" defaultValue={q.city ?? ""} className={field}>
            <option value="">vsi</option>
            {cities.map((c) => (
              <option key={c.city} value={c.city!}>
                {c.city} ({c.n})
              </option>
            ))}
          </select>
        </label>
        <label className={lab}>
          E-naslov
          <select name="email" defaultValue={q.email ?? ""} className={field}>
            <option value="">vseeno</option>
            <option value="yes">ima</option>
            <option value="no">nima</option>
          </select>
        </label>
        <label className={lab}>
          Stran
          <select name="site" defaultValue={q.site ?? ""} className={field}>
            <option value="">vseeno</option>
            <option value="own">ima svojo</option>
            <option value="none">nima / samo FB</option>
          </select>
        </label>
        <label className={lab}>
          Razvrsti
          <select name="sort" defaultValue={q.sort ?? "score"} className={field}>
            <option value="score">točke</option>
            <option value="rating">Google ocena</option>
            <option value="reviews">št. mnenj</option>
            <option value="new">najnovejša</option>
            <option value="name">ime</option>
          </select>
        </label>
        <label className={lab}>
          Točke vsaj
          <input name="min" type="number" min={0} max={100} defaultValue={q.minScore ?? ""} className={field} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
          <input type="checkbox" name="good" value="1" defaultChecked={!!q.good} className="h-4 w-4 accent-[#00FF41]" /> dober posel
        </label>
        <div className="col-span-2 flex items-end gap-3 md:col-span-4 xl:col-span-6">
          <button
            type="submit"
            className="border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent"
          >
            &gt; Filtriraj
          </button>
          <Link href="/podjetja" className="px-2 py-2 font-mono text-xs uppercase tracking-widest text-text-secondary hover:text-accent">
            Počisti
          </Link>
          <span className="ml-auto font-mono text-xs text-text-secondary">
            Prikazanih {rows.length} od {rows.total}
          </span>
        </div>
      </form>

      <CompanyTable rows={rows} />
    </>
  );
}
