"use client";
import { useActionState } from "react";
import {
  addEmailAction,
  approveAction,
  blockAction,
  discardAction,
  draftOneAction,
  draftTopAction,
  repliedAction,
  sendAction,
  unapproveAction,
  type ActionState,
} from "./actions";

export const btn =
  "border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent disabled:opacity-50 disabled:hover:bg-accent disabled:hover:text-black";
export const ghost =
  "border border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-text-secondary hover:border-text-primary hover:text-text-primary disabled:opacity-50";
const danger = "border border-danger-text/60 px-4 py-2 font-mono text-xs uppercase tracking-widest text-danger-text hover:bg-danger-text hover:text-black disabled:opacity-50";
const input = "w-full border border-border bg-black px-3 py-2 font-sans text-sm text-text-primary focus:border-accent focus:outline-none";

function Msg({ state }: { state: ActionState }) {
  return state ? <p role="status" className={`font-mono text-xs ${state.ok ? "text-accent" : "text-danger-text"}`}>&gt; {state.message}</p> : null;
}

export function PendingDraftForm({ id, subject, body }: { id: string; subject: string; body: string }) {
  const [state, approve, busy] = useActionState<ActionState, FormData>(approveAction, null);
  const [dState, discard, dBusy] = useActionState<ActionState, FormData>(discardAction, null);
  return (
    <div className="flex flex-col gap-3">
      <form action={approve} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={id} />
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">Zadeva</span>
          <input name="subject" defaultValue={subject} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">Besedilo</span>
          <textarea name="body" defaultValue={body} rows={Math.min(22, body.split("\n").length + 3)} className={`${input} font-sans leading-relaxed`} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={btn}>
            {busy ? "Shranjujem…" : "> Shrani in odobri"}
          </button>
          <button type="submit" formAction={discard} disabled={dBusy} className={ghost}>
            Zavrzi
          </button>
          <Msg state={state ?? dState} />
        </div>
      </form>
    </div>
  );
}

export function ApprovedDraftActions({ id, locked }: { id: string; locked: boolean }) {
  const [state, send, busy] = useActionState<ActionState, FormData>(sendAction, null);
  const [uState, unapprove, uBusy] = useActionState<ActionState, FormData>(unapproveAction, null);
  return (
    <form action={send} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={busy || locked} className={btn} title={locked ? "Pošiljanje je zaklenjeno" : undefined}>
        {busy ? "Pošiljam…" : locked ? "Zaklenjeno" : "> Pošlji"}
      </button>
      <button type="submit" formAction={unapprove} disabled={uBusy} className={ghost}>
        Uredi znova
      </button>
      <Msg state={state ?? uState} />
    </form>
  );
}

export function DraftTopButton() {
  const [state, action, busy] = useActionState<ActionState>(draftTopAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={busy} className={btn}>
        {busy ? "Pripravljam…" : "> Pripravi osnutke za teh 10"}
      </button>
      <Msg state={state} />
    </form>
  );
}

export function CompanyOutreach({ companyId, stage, hasEmail }: { companyId: string; stage: string | null; hasEmail: boolean }) {
  const [dState, draft, dBusy] = useActionState<ActionState, FormData>(draftOneAction, null);
  const [eState, addEmail, eBusy] = useActionState<ActionState, FormData>(addEmailAction, null);
  const [rState, replied, rBusy] = useActionState<ActionState, FormData>(repliedAction, null);
  const [bState, block, bBusy] = useActionState<ActionState, FormData>(blockAction, null);
  const early = stage === "found" || stage === "researched";
  const closed = stage === "lost";
  return (
    <div className="flex flex-col gap-5">
      {early ? (
        <form action={draft} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="companyId" value={companyId} />
          <button type="submit" disabled={dBusy || !hasEmail} className={btn} title={hasEmail ? undefined : "Najprej dodaj e-naslov"}>
            {dBusy ? "Pripravljam…" : "> Pripravi prvi e-mail"}
          </button>
          <Msg state={dState} />
        </form>
      ) : null}

      {!closed ? (
        <form action={addEmail} className="flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">Dodaj javno objavljen e-naslov</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input type="hidden" name="companyId" value={companyId} />
            <input name="email" type="email" required placeholder="info@podjetje.si" className={input} />
            <input name="source" required placeholder="Kje je objavljen (povezava)" className={input} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={eBusy} className={ghost}>
              Dodaj
            </button>
            <Msg state={eState} />
          </div>
        </form>
      ) : null}

      {stage === "contacted" ? (
        <form action={replied} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="companyId" value={companyId} />
          <button type="submit" disabled={rBusy} className={ghost}>
            Odgovoril je (ustavi follow-upe)
          </button>
          <Msg state={rState} />
        </form>
      ) : null}

      {!closed ? (
        <form action={block} className="flex flex-col gap-2 border-t border-border pt-4">
          <input type="hidden" name="companyId" value={companyId} />
          <input name="reason" placeholder="Razlog (npr. »ni zainteresiran«)" className={input} />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
              <input type="checkbox" name="confirm" className="accent-[#FF3B3B]" /> Trajno, ni mogoče razveljaviti
            </label>
            <button type="submit" disabled={bBusy} className={danger}>
              Ne kontaktiraj
            </button>
            <Msg state={bState} />
          </div>
        </form>
      ) : (
        <p className="font-mono text-xs text-danger-text">&gt; Podjetje je na seznamu »ne kontaktiraj« ali izgubljeno.</p>
      )}
    </div>
  );
}

/** One-click add for an e-mail the web search saw but we could not verify automatically (TASK-031). */
export function AddCandidateEmail({ companyId, email, source }: { companyId: string; email: string; source: string }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(addEmailAction, null);
  if (state?.ok) return <span className="font-mono text-xs text-accent">✓ dodan</span>;
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="source" value={source || "splet (potrdil lastnik)"} />
      <button type="submit" disabled={busy} className="border border-accent/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-accent hover:bg-accent hover:text-black">
        {busy ? "…" : "Potrdi in dodaj"}
      </button>
      {state && !state.ok ? <span className="font-mono text-[10px] text-danger-text">{state.message}</span> : null}
    </form>
  );
}
