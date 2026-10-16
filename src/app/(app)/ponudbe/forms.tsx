"use client";
import { useActionState } from "react";
import { emailProposalAction, newProposalAction, paidAction, saveProposalAction, type ActionState } from "./actions";

const btn =
  "border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent disabled:opacity-60";
const ghost = "border border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-text-secondary hover:border-text-primary hover:text-text-primary disabled:opacity-60";
const input = "w-full border border-border bg-black px-3 py-2 font-sans text-sm text-text-primary focus:border-accent focus:outline-none";
const lab = "flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest text-text-secondary";

function Msg({ s }: { s: ActionState }) {
  return s ? <p role="status" className={`font-mono text-xs ${s.ok ? "text-accent" : "text-danger-text"}`}>&gt; {s.message}</p> : null;
}

export function NewProposalButton({ companyId }: { companyId: string }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(newProposalAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="companyId" value={companyId} />
      <button type="submit" disabled={busy} className={btn}>
        {busy ? "Pripravljam…" : "> Pripravi ponudbo"}
      </button>
      <Msg s={state} />
    </form>
  );
}

export type EditorValues = { id: string; title: string; intro: string; items: string; timelineDays: number; depositPct: number; materials: string; validUntil: string; locked: boolean };

export function ProposalEditor({ v }: { v: EditorValues }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(saveProposalAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={v.id} />
      <label className={lab}>
        Naslov
        <input name="title" defaultValue={v.title} disabled={v.locked} className={input} />
      </label>
      <label className={lab}>
        Uvod
        <textarea name="intro" defaultValue={v.intro} rows={3} disabled={v.locked} className={input} />
      </label>
      <label className={lab}>
        Postavke — vsaka v svoji vrstici: opis | cena brez DDV
        <textarea name="items" defaultValue={v.items} rows={5} disabled={v.locked} className={`${input} font-mono text-xs`} />
      </label>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className={lab}>
          Rok izdelave (dni od materialov)
          <input name="timelineDays" type="number" min={1} max={120} defaultValue={v.timelineDays} disabled={v.locked} className={input} />
        </label>
        <label className={lab}>
          Predplačilo (%)
          <input name="depositPct" type="number" min={0} max={100} defaultValue={v.depositPct} disabled={v.locked} className={input} />
        </label>
        <label className={lab}>
          Velja do
          <input name="validUntil" type="date" defaultValue={v.validUntil} disabled={v.locked} className={input} />
        </label>
      </div>
      <label className={lab}>
        Potrebni materiali — vsak v svoji vrstici
        <textarea name="materials" defaultValue={v.materials} rows={6} disabled={v.locked} className={input} />
      </label>
      {v.locked ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={btn}>
            {busy ? "Shranjujem…" : "> Shrani"}
          </button>
          <Msg s={state} />
        </div>
      )}
    </form>
  );
}

export function EmailProposalButton({ id, sent }: { id: string; sent: boolean }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(emailProposalAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={busy} className={sent ? ghost : btn}>
        {busy ? "Pripravljam…" : sent ? "Pripravi e-mail še enkrat" : "> Pripravi e-mail s ponudbo"}
      </button>
      <Msg s={state} />
    </form>
  );
}

export function PaidButton({ companyId }: { companyId: string }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(paidAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="companyId" value={companyId} />
      <button type="submit" disabled={busy} className={btn}>
        {busy ? "…" : "> Predplačilo prejeto — stranka"}
      </button>
      <Msg s={state} />
    </form>
  );
}
