import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { JobLine } from "../../podjetja/buttons";
import { formatLj } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { latestJob } from "@/server/jobs";
import { checklistFor } from "@/server/sites/checklist";
import { getSitesConfig } from "@/server/sites/config";
import { STEPS, type StepResult } from "@/server/sites/kickoff";
import { STAGES, STAGE_LABEL, type Stage } from "@/server/sites/stages";
import { getSite } from "@/server/sites/store";
import { ApproveForm, CopyPrompt, EditorsForm, FactsForm, LinksForm, OpButton, RegisteredForm, StageForm, Tick } from "./panels";

export const dynamic = "force-dynamic";
const STEP_LABEL: Record<string, string> = { repo: "Repozitorij iz predloge", editor_config: "editor.config.json", brief: "BRIEF.md", claude_md: "CLAUDE.md (razdelek stranke)", assets: "brief/assets", prompt: "Poziv za Claude", editor_registry: "Vpis v repozitorij urednikov" };
const KIND: Record<string, string> = { client: "stranka", migration: "selitev", own: "naša stran" };
const h2 = "mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accent";

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = getDb();
  const r = await getSite(db, id);
  if (!r) notFound();
  const s = r.s;
  const cfg = await getSitesConfig(db);
  const job = await latestJob(db, ["site_kickoff"], s.companyId, 15 * 60_000);
  const steps = s.steps as Record<string, StepResult>;
  const links = s.links as Record<string, string>;
  const ticks = s.checklist as Record<string, string>;
  const editors = s.editors as { email: string; role: string }[];
  const stage = s.stage as Stage;
  const ready = s.stage !== "setup";
  return (
    <>
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
        <Link href="/strani" className="hover:text-accent">← Strani</Link> · <Link href={`/podjetja/${s.companyId}`} className="hover:text-accent">{r.companyName}</Link>
      </p>
      <PageHeader title={`Stran · ${r.companyName}`} description={`${KIND[s.kind]} · ${s.siteId} · ${s.domain ?? "domena še ni določena"} · faza: ${STAGE_LABEL[stage]}`} />

      <div className="mb-8 flex flex-wrap gap-1 font-mono text-[10px] uppercase tracking-widest">
        {STAGES.map((x) => (
          <span key={x} className={`border px-2 py-1 ${x === stage ? "border-accent bg-accent text-black" : STAGES.indexOf(x) < STAGES.indexOf(stage) ? "border-accent text-accent" : "border-border text-text-secondary"}`}>{STAGE_LABEL[x]}</span>
        ))}
      </div>
      {s.stageNote ? <p className="mb-6 font-sans text-sm text-text-secondary">Zadnja opomba: {s.stageNote}</p> : null}

      {s.registered ? (
        <section className="mb-8 border border-border bg-surface p-4">
          <h2 className={h2}>{"// Obstoječa stran"}</h2>
          <p className="font-sans text-sm text-text-secondary">
            Registrirana ročno. CRM v njenem repozitoriju ne ustvarja in ne piše ničesar.
            {s.legacy ? " Stara arhitektura (brez editor.config.json): kandidat za selitev na predlogo." : ""}
          </p>
          <p className="mb-3 mt-2 font-sans text-xs text-text-secondary">
            {s.repoFullName ? <a className="text-accent" href={`https://github.com/${s.repoFullName}`} target="_blank" rel="noopener noreferrer">{s.repoFullName}</a> : "Repozitorij ni naveden"}. Postopek za Cloudflare in urejevalnik: docs/technical/cloudflare.md v repozitoriju CRM.
          </p>
          <RegisteredForm id={s.id} v={{ hosting: s.hosting ?? "", editorState: s.editorState, legacy: s.legacy, repo: s.repoFullName ?? "" }} />
        </section>
      ) : null}
      {!s.registered ? (
      <section className="mb-8">
        <h2 className={h2}>{"// Priprava paketa"}</h2>
        <ul className="mb-3 border border-border">
          {STEPS.map((k) => {
            const st = steps[k];
            return (
              <li key={k} className="flex flex-wrap items-baseline gap-x-3 border-b border-border bg-surface px-4 py-2 last:border-b-0">
                <span className={`font-mono text-xs ${st?.ok ? "text-accent" : st ? "text-danger-text" : "text-text-secondary"}`}>{st?.ok ? "✓" : st ? "✗" : "·"}</span>
                <span className="font-sans text-sm text-text-primary">{STEP_LABEL[k]}</span>
                <span className="font-sans text-xs text-text-secondary">{st?.ok ? st.detail : st?.error}</span>
              </li>
            );
          })}
        </ul>
        <JobLine job={job ? { status: job.status, message: job.message, done: job.done, total: job.total, failed: job.failed } : null} label="Priprava teče" />
        <div className="mt-3 flex flex-wrap gap-3">
          <OpButton id={s.id} op="kickoff" label={ready ? "Ponovi manjkajoče korake" : "Začni pripravo"} primary={!ready} />
          {ready ? <OpButton id={s.id} op="refresh" label="Osveži paket (nov BRIEF)" /> : null}
        </div>
        <p className="mt-2 font-sans text-xs text-text-secondary">Brief v{s.briefVersion} · repozitorij: {s.repoFullName ? <a className="text-accent" href={`https://github.com/${s.repoFullName}`} target="_blank" rel="noopener noreferrer">{s.repoFullName}</a> : "še ni"} · navodila v{s.guideVersion ?? cfg.guideVersion}</p>
      </section>
      ) : null}

      {s.kickoffPrompt ? (
        <section className="mb-8">
          <h2 className={h2}>{"// Poziv za Claude agenta"}</h2>
          <p className="mb-2 font-sans text-xs text-text-secondary">Odpri nov Claude pogovor z dostopom do CRM povezave (MCP) in prilepi.</p>
          <CopyPrompt text={s.kickoffPrompt} />
        </section>
      ) : null}

      {!s.registered ? (
      <section className="mb-8">
        <h2 className={h2}>{"// Faza in odobritev dizajna"}</h2>
        {stage === "design_draft" ? (
          <div className="mb-4 border border-accent p-4">
            <p className="mb-2 font-sans text-sm text-text-primary">Osnutek dizajna je pripravljen{links.design ? <> — <a className="text-accent" href={links.design} target="_blank" rel="noopener noreferrer">odpri</a></> : ""}. Gradnja se začne šele po tvoji odobritvi.</p>
            <ApproveForm id={s.id} />
          </div>
        ) : null}
        <StageForm id={s.id} current={s.stage} stages={STAGES.map((x) => ({ value: x, label: STAGE_LABEL[x] }))} />
        {s.approvedAt ? <p className="mt-2 font-sans text-xs text-text-secondary">Dizajn odobren {formatLj(s.approvedAt, false)}.</p> : null}
        {s.startReason ? <p className="mt-2 font-sans text-xs text-text-secondary">Začetek brez predplačila: {s.startReason}</p> : null}
      </section>
      ) : null}

      <section className="mb-8">
        <h2 className={h2}>{"// Povezave"}</h2>
        <LinksForm id={s.id} v={{ live: links.live ?? "", dev: links.dev ?? "", preview: links.preview ?? "", design: links.design ?? "" }} />
      </section>

      <section className="mb-8">
        <h2 className={h2}>{"// Dejstva za agenta"}</h2>
        <FactsForm id={s.id} v={{ domain: s.domain ?? "", contact: s.contact ?? "", features: s.features ?? "", deadline: s.deadline ?? "", notes: s.notes ?? "", ownerNotes: s.ownerNotes ?? "", hasCgp: s.hasCgp, languages: (s.languages as string[]).join(", ") }} />
      </section>

      <section className="mb-8">
        <h2 className={h2}>{"// Uredniki (e-naslov in vloga)"}</h2>
        <EditorsForm id={s.id} value={editors.map((e) => `${e.email} ${e.role}`).join("\n")} />
      </section>

      {!s.registered ? (
      <section className="mb-8">
        <h2 className={h2}>{"// Ročni koraki (v1 brez avtomatizacije)"}</h2>
        <ul className="flex flex-col gap-4">
          {checklistFor(s.siteId, s.domain).map((c) => (
            <li key={c.key} className="border border-border bg-surface p-4">
              <div className="mb-2 flex items-center gap-3">
                <Tick id={s.id} k={c.key} done={!!ticks[c.key]} />
                <span className="font-sans text-sm font-semibold text-text-primary">{c.title}</span>
              </div>
              <ol className="ml-8 list-decimal space-y-1 font-sans text-xs text-text-secondary">
                {c.steps.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      </section>
      ) : null}
    </>
  );
}
