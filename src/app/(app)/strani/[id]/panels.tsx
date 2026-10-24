"use client";
import { useActionState, useState } from "react";
import { siteAction, type ActionState } from "../actions";

export const btn = "border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent disabled:opacity-60";
export const ghost = "border border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-text-secondary hover:border-text-primary hover:text-text-primary disabled:opacity-60";
const input = "w-full border border-border bg-black px-3 py-2 font-sans text-sm text-text-primary focus:border-accent focus:outline-none";
const lbl = "font-mono text-[10px] uppercase tracking-widest text-text-secondary";

function Msg({ s }: { s: ActionState }) {
  return s ? <p role="status" className={`font-mono text-xs ${s.ok ? "text-accent" : "text-danger-text"}`}>&gt; {s.message}</p> : null;
}
function useOp() {
  return useActionState<ActionState, FormData>(siteAction, null);
}

export function OpButton({ id, op, label, primary = false, disabled = false }: { id: string; op: string; label: string; primary?: boolean; disabled?: boolean }) {
  const [state, action, busy] = useOp();
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <button type="submit" disabled={busy || disabled} className={primary ? btn : ghost}>
        {busy ? "…" : label}
      </button>
      <Msg s={state} />
    </form>
  );
}

export function ApproveForm({ id }: { id: string }) {
  const [state, action, busy] = useOp();
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="approve" />
      <input name="note" placeholder="Opomba (npr. odobreno, barve malo toplejše)" className={input} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={btn}>
          Odobri dizajn
        </button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function StageForm({ id, stages, current }: { id: string; stages: { value: string; label: string }[]; current: string }) {
  const [state, action, busy] = useOp();
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="stage" />
      <select name="to" defaultValue={current} className={`${input} w-auto`}>
        {stages.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <input name="note" placeholder="Opomba" className={`${input} w-56`} />
      <button type="submit" disabled={busy} className={ghost}>
        Spremeni fazo
      </button>
      <Msg s={state} />
    </form>
  );
}

export function Tick({ id, k, done }: { id: string; k: string; done: boolean }) {
  const [, action, busy] = useOp();
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="tick" />
      <input type="hidden" name="key" value={k} />
      <input type="hidden" name="done" value={done ? "0" : "1"} />
      <button type="submit" disabled={busy} className={`h-5 w-5 border font-mono text-xs leading-none ${done ? "border-accent bg-accent text-black" : "border-border text-transparent hover:border-accent"}`} title={done ? "Odkljukano" : "Označi kot narejeno"}>
        ✓
      </button>
    </form>
  );
}

export function FactsForm({ id, v }: { id: string; v: { domain: string; contact: string; features: string; deadline: string; notes: string; ownerNotes: string; hasCgp: boolean; languages: string } }) {
  const [state, action, busy] = useOp();
  return (
    <form action={action} className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="facts" />
      <label className="flex flex-col gap-1"><span className={lbl}>Domena</span><input name="domain" defaultValue={v.domain} className={input} /></label>
      <label className="flex flex-col gap-1"><span className={lbl}>Jeziki</span><input name="languages" defaultValue={v.languages} className={input} /></label>
      <label className="flex flex-col gap-1"><span className={lbl}>Rok</span><input name="deadline" type="date" defaultValue={v.deadline} className={input} /></label>
      <label className="flex items-center gap-2 font-sans text-sm text-text-primary"><input type="checkbox" name="hasCgp" defaultChecked={v.hasCgp} /> CGP že obstaja</label>
      <label className="flex flex-col gap-1 md:col-span-2"><span className={lbl}>Kontakt pri stranki</span><textarea name="contact" rows={2} defaultValue={v.contact} className={input} /></label>
      <label className="flex flex-col gap-1 md:col-span-2"><span className={lbl}>Obseg in posebnosti</span><textarea name="features" rows={2} defaultValue={v.features} className={input} /></label>
      <label className="flex flex-col gap-1 md:col-span-2"><span className={lbl}>Opombe za agenta (gre v BRIEF.md)</span><textarea name="notes" rows={4} defaultValue={v.notes} className={input} /></label>
      <label className="flex flex-col gap-1 md:col-span-2"><span className={lbl}>Zasebne opombe (samo CRM)</span><textarea name="ownerNotes" rows={2} defaultValue={v.ownerNotes} className={input} /></label>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" disabled={busy} className={ghost}>Shrani</button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function EditorsForm({ id, value }: { id: string; value: string }) {
  const [state, action, busy] = useOp();
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="editors" />
      <textarea name="editors" rows={3} defaultValue={value} placeholder={"ime@stranka.si owner\nsodelavka@stranka.si editor"} className={input} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={ghost}>Shrani urednike</button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function LinksForm({ id, v }: { id: string; v: { live: string; dev: string; preview: string; design: string } }) {
  const [state, action, busy] = useOp();
  return (
    <form action={action} className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="links" />
      {(["live", "dev", "preview", "design"] as const).map((k) => (
        <label key={k} className="flex flex-col gap-1"><span className={lbl}>{{ live: "Živa stran", dev: "Dev stran", preview: "Predogled", design: "Osnutek dizajna" }[k]}</span><input name={k} defaultValue={v[k]} placeholder="https://…" className={input} /></label>
      ))}
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" disabled={busy} className={ghost}>Shrani povezave</button>
        <Msg s={state} />
      </div>
    </form>
  );
}

export function CopyPrompt({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap border border-border bg-black p-3 font-mono text-xs text-text-primary">{text}</pre>
      <button
        type="button"
        className={`${btn} w-fit`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Kopirano ✓" : "Kopiraj"}
      </button>
    </div>
  );
}
