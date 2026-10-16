import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { formatLj } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { listProjects, type Material } from "@/server/projects/projects";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const rows = await listProjects(getDb());
  return (
    <>
      <PageHeader title="Projekti" description="Po predplačilu: materiali, 7-dnevni rok, objava." />
      {rows.length === 0 ? (
        <p className="border border-border bg-surface p-5 font-mono text-xs text-text-secondary">&gt; Še ni projektov. Projekt nastane, ko pri sprejeti ponudbi klikneš »Predplačilo prejeto«.</p>
      ) : (
        <ul className="border border-border">
          {rows.map((r) => {
            const m = r.p.materials as Material[];
            const c = r.clock;
            const state = r.p.launchedAt
              ? `objavljeno ${formatLj(r.p.launchedAt, false)}${r.p.finalPaidAt ? " · plačano" : " · čaka preostanek"}`
              : c.started
                ? c.paused
                  ? "rok USTAVLJEN"
                  : `rok ${formatLj(c.deadline, false)} · še ${c.daysLeft} dni`
                : `materiali ${m.filter((x) => x.done).length}/${m.length}`;
            const urgent = c.started && !r.p.launchedAt && !c.paused && (c.daysLeft ?? 9) <= 2;
            return (
              <li key={r.p.id} className="flex flex-wrap items-center gap-x-4 border-b border-border bg-surface px-5 py-3 last:border-b-0">
                <Link href={`/projekti/${r.p.id}`} className="font-sans text-sm text-text-primary hover:text-accent">
                  {r.companyName}
                </Link>
                <span className={`ml-auto font-mono text-xs ${urgent ? "text-danger-text" : "text-text-secondary"}`}>{state}</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
