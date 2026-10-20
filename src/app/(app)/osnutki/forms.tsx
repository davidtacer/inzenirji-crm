"use client";
import { useActionState } from "react";
import { useRef } from "react";
import {
  addAttachmentAction,
  removeAttachmentAction,
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

export function PendingDraftForm({ id, subject, body, toEmail, emails = [] }: { id: string; subject: string; body: string; toEmail?: string; emails?: string[] }) {
  const options = toEmail && !emails.includes(toEmail) ? [toEmail, ...emails] : emails;
  const [state, approve, busy] = useActionState<ActionState, FormData>(approveAction, null);
  const [dState, discard, dBusy] = useActionState<ActionState, FormData>(discardAction, null);
  return (
    <div className="flex flex-col gap-3">
      <form action={approve} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={id} />
        {options.length > 1 ? (
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">Prejemnik</span>
            <select name="toEmail" defaultValue={toEmail} className={input}>
              {options.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
        ) : null}
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

export type AttachmentView = { id: string; name: string; size: string };

/** Files sent with this e-mail; add or remove until it is sent (owner 2026-10-20). */
export function DraftAttachments({ draftId, items, coldFirst }: { draftId: string; items: AttachmentView[]; coldFirst: boolean }) {
  const [state, add, busy] = useActionState<ActionState, FormData>(addAttachmentAction, null);
  const [rState, remove, rBusy] = useActionState<ActionState, FormData>(removeAttachmentAction, null);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">Priponke{items.length ? ` (${items.length})` : ""}</p>
      {items.length ? (
        <ul className="flex flex-col gap-1">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 font-mono text-xs">
              <a href={`/api/osnutki/priponka/${a.id}`} className="text-text-primary underline hover:text-accent">
                📎 {a.name}
              </a>
              <span className="text-text-secondary">{a.size}</span>
              <form action={remove}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" disabled={rBusy} className="text-[10px] uppercase tracking-widest text-danger-text hover:underline">
                  Odstrani
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        action={async (f) => {
          await add(f);
          if (fileRef.current) fileRef.current.value = "";
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <input type="hidden" name="id" value={draftId} />
        <input
          ref={fileRef}
          type="file"
          name="files"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt"
          className="max-w-full font-mono text-xs text-text-secondary file:mr-3 file:border file:border-border file:bg-black file:px-3 file:py-1 file:font-mono file:text-xs file:text-text-primary"
        />
        <button type="submit" disabled={busy} className={ghost}>
          {busy ? "Nalagam…" : "Pripni"}
        </button>
        <Msg state={state ?? rState} />
      </form>
      <p className="font-mono text-[10px] text-text-secondary">
        Do 5 datotek, skupaj do 15 MB (slike, PDF, Word, Excel, ZIP).
        {coldFirst ? " Pri prvem e-mailu neznancu priponka poveča možnost, da mail pristane v vsiljeni pošti - raje jo pošlji, ko odgovori." : ""}
      </p>
    </div>
  );
}
