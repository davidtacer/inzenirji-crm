import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { formatLj } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { eur } from "@/server/proposals/proposals";
import { getProject, projectUrl, type Material } from "@/server/projects/projects";
import { siteProjects } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { ItemToggle, OpButton, PauseForm } from "../forms";

export const dynamic = "force-dynamic";

const kb = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1).replace(".", ",")} MB` : `${Math.ceil(n / 1024)} kB`);

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await getProject(getDb(), id);
  if (!r) notFound();
  const p = r.p;
  const mats = p.materials as Material[];
  const done = mats.filter((m) => m.done).length;
  const c = r.clock;
  const openPause = r.pauses.find((x) => !x.endAt);
  const [site] = await getDb().select({ id: siteProjects.id }).from(siteProjects).where(eq(siteProjects.projectId, id)).limit(1);
  return (
    <>
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
        <Link href={`/podjetja/${r.companyId}`} className="hover:text-accent">
          ← {r.companyName}
        </Link>
      </p>
      <PageHeader title={`Projekt · ${r.companyName}`} description={`Predplačilo ${p.depositCents ? eur(p.depositCents) : "—"} prejeto ${formatLj(p.depositPaidAt, false)}`} />

      <p className="mb-6">
        {site ? (
          <Link href={`/strani/${site.id}`} className="font-mono text-xs uppercase tracking-widest text-accent hover:underline">
            Odpri stran →
          </Link>
        ) : (
          <Link href={`/strani/nova?podjetje=${r.companyId}&projekt=${id}`} className="border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent">
            Začni izdelavo strani
          </Link>
        )}
      </p>

      <div className="mb-6 grid grid-cols-1 border border-border md:grid-cols-3">
        <div className="border-b border-border bg-surface p-5 md:border-b-0 md:border-r">
          <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">Materiali</p>
          <p className="mt-2 font-mono text-3xl font-extrabold text-accent">
            {done}/{mats.length}
          </p>
        </div>
        <div className="border-b border-border bg-surface p-5 md:border-b-0 md:border-r">
          <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">Rok ({p.timelineDays} dni)</p>
          <p className={`mt-2 font-mono text-xl font-bold ${c.daysLeft !== null && c.daysLeft <= 2 ? "text-danger-text" : "text-text-primary"}`}>
            {p.launchedAt ? `objavljeno ${formatLj(p.launchedAt, false)}` : c.started ? `${formatLj(c.deadline)}` : "še ne teče"}
          </p>
          <p className="mt-1 font-mono text-xs text-text-secondary">
            {c.started && !p.launchedAt ? (c.paused ? "USTAVLJEN" : `še ${c.daysLeft} dni`) : c.started ? "" : "začne teči, ko pošlješ potrditveni e-mail"}
          </p>
        </div>
        <div className="bg-surface p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">Povezava za stranko</p>
          <a href={projectUrl(p.token)} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all font-mono text-xs text-accent hover:underline">
            {projectUrl(p.token)} ↗
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
        <section className="border border-border bg-surface">
          <h2 className="border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{"// Materiali"}</h2>
          <ul>
            {mats.map((m, i) => (
              <li key={i} className="flex gap-4 border-b border-border px-5 py-4 last:border-b-0">
                <ItemToggle id={p.id} index={i} done={m.done} />
                <div className="min-w-0 flex-1">
                  <p className={`font-sans text-sm ${m.done ? "text-text-primary" : "text-text-secondary"}`}>{m.label}</p>
                  {m.text ? <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-text-secondary">{m.text}</pre> : null}
                  <ul className="mt-1 flex flex-col gap-1">
                    {r.files
                      .filter((f) => f.itemIndex === i)
                      .map((f) => (
                        <li key={f.id}>
                          <a href={`/api/projekti/datoteka/${f.id}`} className="font-mono text-xs text-accent hover:underline">
                            ↓ {f.name}
                          </a>{" "}
                          <span className="font-mono text-[10px] text-text-secondary">{kb(f.size)}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <aside className="flex h-fit flex-col gap-4 border border-border bg-surface p-5">
          {!c.started ? (
            <>
              <OpButton id={p.id} op="materials" label={done ? "Opomni stranko, kaj manjka" : "> Pošlji povezavo za materiale"} primary={!done} />
              <OpButton id={p.id} op="confirm" label="> Vse prejeto — potrdi in začni rok" primary={done === mats.length} />
            </>
          ) : null}
          {c.started && !p.launchedAt ? (
            <>
              {openPause ? (
                <>
                  <p className="font-mono text-xs text-[#F0B429]">&gt; Ustavljen od {formatLj(openPause.startAt)}: {openPause.reason}</p>
                  <OpButton id={p.id} op="resume" label="> Nadaljuj rok" primary />
                </>
              ) : (
                <PauseForm id={p.id} />
              )}
              <OpButton id={p.id} op="launch" label="> Stran je objavljena" primary />
            </>
          ) : null}
          {p.launchedAt && !p.finalPaidAt ? <OpButton id={p.id} op="final" label="> Preostanek plačan" primary /> : null}
          {p.finalPaidAt ? <p className="font-mono text-xs text-accent">&gt; Zaključeno, plačano {formatLj(p.finalPaidAt, false)}.</p> : null}
          {r.pauses.length ? (
            <div className="border-t border-border pt-3 font-mono text-[10px] text-text-secondary">
              <p className="mb-1 uppercase tracking-widest">Ustavitve roka</p>
              {r.pauses.map((x) => (
                <p key={x.id}>
                  {formatLj(x.startAt)} → {x.endAt ? formatLj(x.endAt) : "…"} · {x.reason}
                </p>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}
