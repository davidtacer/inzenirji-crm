"use client";
import { useActionState, useState } from "react";
import { STAGE_LABEL } from "@/lib/labels";
import { briefAction, notesAction, stageAction, type ActionState } from "./actions";

const btn =
  "border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent disabled:opacity-60";
const ghost = "border border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-text-secondary hover:border-text-primary hover:text-text-primary disabled:opacity-60";
const input = "w-full border border-border bg-black px-3 py-2 font-sans text-sm text-text-primary focus:border-accent focus:outline-none";

function Msg({ s }: { s: ActionState }) {
  return s ? <p role="status" className={`font-mono text-xs ${s.ok ? "text-accent" : "text-danger-text"}`}>&gt; {s.message}</p> : null;
}

const ORDER = ["found", "researched", "contacted", "replied", "call_booked", "call_done", "proposal_sent", "won", "lost", "nurture"];

export function StageForm({ companyId, stage, callAt }: { companyId: string; stage: string; callAt: string }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(stageAction, null);
  const [sel, setSel] = useState(stage);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="companyId" value={companyId} />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <select name="stage" value={sel} onChange={(e) => setSel(e.target.value)} className={input}>
          {ORDER.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        {sel === "call_booked" ? <input type="datetime-local" name="callAt" defaultValue={callAt} required className={input} /> : null}
        {sel === "lost" ? <input name="lostReason" placeholder="Zakaj? (npr. predrago, ima izvajalca)" required className={input} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={ghost}>
          {busy ? "Shranjujem…" : "Spremeni fazo"}
        </button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function BriefButton({ companyId, again }: { companyId: string; again: boolean }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(briefAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="companyId" value={companyId} />
      <button type="submit" disabled={busy} className={again ? ghost : btn}>
        {busy ? "Pripravljam…" : again ? "Osveži brief" : "> Pripravi brief za klic"}
      </button>
      <Msg s={state} />
    </form>
  );
}

export function NotesForm({ companyId }: { companyId: string }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(notesAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="companyId" value={companyId} />
      <textarea
        name="notes"
        rows={5}
        placeholder="Kaj ste se dogovorili: koliko podstrani, funkcije, jeziki, roki, pomisleki, naslednji korak …"
        className={input}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={btn}>
          {busy ? "Shranjujem…" : "> Shrani zapiske klica"}
        </button>
        <Msg s={state} />
      </div>
    </form>
  );
}
