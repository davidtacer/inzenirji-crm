import { BriefButton, NotesForm, StageForm } from "@/app/(app)/klici/forms";
import type { Brief, CallSummary } from "@/server/calls/calls";
import { defaultCallInput, formatLj, toLocalInput } from "@/lib/time";
import { NewProposalButton } from "@/app/(app)/ponudbe/forms";
import Link from "next/link";

const h = "mb-1 font-mono text-[10px] uppercase tracking-widest text-text-secondary";

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className={h}>{title}</p>
      <ul className="list-disc pl-5 font-sans text-sm text-text-primary">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

export function SalesPanel(props: {
  companyId: string;
  stage: string;
  callAt: Date | null;
  brief: Brief | null;
  briefAt: Date | null;
  summary: CallSummary | null;
  history: { at: Date; notes: string }[];
  proposals: { id: string; status: string; viewCount: number; title: string }[];
}) {
  const { brief, summary } = props;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className={h}>Faza{props.callAt && props.stage === "call_booked" ? ` · klic ${formatLj(props.callAt)}` : ""}</p>
        <StageForm companyId={props.companyId} stage={props.stage} callAt={props.callAt ? toLocalInput(props.callAt) : defaultCallInput()} />
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-5">
        <p className={h}>Brief pred klicem{props.briefAt ? ` · ${formatLj(props.briefAt)}${brief?.source === "rules" ? " · iz pravil" : ""}` : ""}</p>
        {brief ? (
          <div className="flex flex-col gap-3">
            <p className="font-sans text-sm text-text-primary">{brief.business}</p>
            <List title="Težave" items={brief.problems} />
            {brief.competitors ? (
              <div>
                <p className={h}>Konkurenti</p>
                <p className="font-sans text-sm text-text-primary">{brief.competitors}</p>
              </div>
            ) : null}
            <List title="Verjetni pomisleki" items={brief.objections} />
            <div>
              <p className={h}>Kaj ponuditi</p>
              <p className="font-sans text-sm text-accent">{brief.offer}</p>
            </div>
            <List title="Vprašanja za klic" items={brief.questions} />
          </div>
        ) : null}
        <BriefButton companyId={props.companyId} again={!!brief} />
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-5">
        <p className={h}>Zapiski klica</p>
        {summary ? (
          <div className="flex flex-col gap-3 border border-accent/30 p-4">
            <p className="font-sans text-sm text-text-primary">{summary.summary}</p>
            {summary.scope ? <p className="font-sans text-sm text-text-secondary">Obseg: {summary.scope}</p> : null}
            <List title="Želje" items={summary.wishes} />
            <List title="Pomisleki" items={summary.objections} />
            {summary.nextStep ? <p className="font-sans text-sm text-accent">Naslednji korak: {summary.nextStep}</p> : null}
            {summary.package ? <p className="font-mono text-xs text-accent">Paket: {summary.package === "A" ? "A · prenos" : "B · nova stran"}</p> : null}
            <List title="Materiali za ponudbo" items={summary.materials} />
          </div>
        ) : null}
        <NotesForm companyId={props.companyId} />
        {props.history.length ? (
          <details className="font-sans text-xs text-text-secondary">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest">Vsi zapiski ({props.history.length})</summary>
            <ol className="mt-2 flex flex-col gap-2">
              {props.history.map((x, i) => (
                <li key={i} className="border-l border-border pl-3">
                  <span className="font-mono">{formatLj(x.at)}</span>
                  <p className="whitespace-pre-wrap">{x.notes}</p>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 border-t border-border pt-5">
        <p className={h}>Ponudba</p>
        {props.proposals.map((p) => (
          <Link key={p.id} href={`/ponudbe/${p.id}`} className="font-sans text-sm text-text-primary hover:text-accent">
            {p.title} · <span className="font-mono text-xs text-text-secondary">{{ draft: "osnutek", sent: "poslana", accepted: "SPREJETA", declined: "zavrnjena" }[p.status]}{p.viewCount ? `, odprta ${p.viewCount}×` : ""}</span> →
          </Link>
        ))}
        {props.proposals.some((p) => p.status === "draft") ? null : <NewProposalButton companyId={props.companyId} />}
      </div>
    </div>
  );
}
