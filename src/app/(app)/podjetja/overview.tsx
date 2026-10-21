"use client";
import { useActionState, useState } from "react";
import { addLinkAction, callLaterAction, googleOverviewAction, markInvalidAction, markValidAction, setChannelAction, setTestAction, setWebsiteAction, updateCompanyAction, type ActionState } from "./actions";
import { JobLine, type JobView } from "./buttons";

const small = "border border-accent/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-accent hover:bg-accent hover:text-black disabled:opacity-50";

export function OverviewButton({ id, job, has, configured }: { id: string; job: JobView; has: boolean; configured: boolean }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(googleOverviewAction, null);
  const running = job?.status === "running";
  if (!configured) return <p className="font-mono text-xs text-text-secondary">&gt; Za Google pregled vpiši ključ za Gemini v Nastavitvah.</p>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={busy || running} className="border border-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-accent hover:bg-accent hover:text-black disabled:opacity-60">
        {busy || running ? "Iščem na Googlu…" : has ? "> Nov Google pregled" : "> Google pregled"}
      </button>
      {job ? <JobLine job={job} /> : state ? <span className="font-mono text-xs text-accent">&gt; {state.message}</span> : null}
    </form>
  );
}

export function AddLink({ companyId, url, kind }: { companyId: string; url: string; kind: string }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(addLinkAction, null);
  if (state?.ok) return <span className="font-mono text-[10px] text-accent">✓ dodano</span>;
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="url" value={url} />
      <input type="hidden" name="kind" value={kind} />
      <button type="submit" disabled={busy} className={small}>
        {busy ? "…" : "Dodaj povezavo"}
      </button>
    </form>
  );
}

export function SetWebsite({ companyId, url }: { companyId: string; url: string }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(setWebsiteAction, null);
  if (state?.ok) return <span className="font-mono text-[10px] text-accent">✓ {state.message}</span>;
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="url" value={url} />
      <button type="submit" disabled={busy} className={small}>
        {busy ? "…" : "Nastavi kot spletno stran"}
      </button>
    </form>
  );
}

/** Owner pastes a link he opened himself (e.g. from Google's sources) and saves it (TASK-037). */
export function PasteLink({ companyId }: { companyId: string }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(addLinkAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="companyId" value={companyId} />
      <input name="url" type="url" required placeholder="https://… (prilepi naslov strani, ki si jo odprl)" className="min-w-0 flex-1 border border-border bg-transparent px-2 py-1 font-sans text-sm text-text-primary" />
      <button type="submit" disabled={busy} className={small}>
        {busy ? "…" : "Dodaj povezavo"}
      </button>
      {state ? <span className={`font-mono text-[10px] ${state.ok ? "text-accent" : "text-danger-text"}`}>{state.ok ? "✓ dodano" : state.message}</span> : null}
    </form>
  );
}

type Details = { name: string; phone: string | null; address: string | null; city: string | null; website: string | null; category: string | null };

const FIELDS: [keyof Details, string, string][] = [
  ["name", "Ime podjetja *", "npr. Dego ali Dejan Novak s.p."],
  ["phone", "Telefon", "npr. 041 123 456"],
  ["address", "Naslov", "npr. Gosposka ulica 2, 2000 Maribor"],
  ["city", "Kraj", "npr. Maribor"],
  ["website", "Spletna stran", "npr. https://podjetje.si"],
  ["category", "Dejavnost", "npr. frizerski salon"],
];

/** "Uredi podatke" on the company page: name and basic details (ADR-051). */
export function EditCompany({ companyId, details }: { companyId: string; details: Details }) {
  const [open, setOpen] = useState(false);
  const [state, action, busy] = useActionState<ActionState, FormData>(async (prev, form) => {
    const r = await updateCompanyAction(prev, form);
    if (r?.ok) setOpen(false);
    return r;
  }, null);
  if (!open)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOpen(true)} className={small}>
          Uredi podatke
        </button>
        {state?.ok ? <span className="font-mono text-[10px] text-accent">✓ {state.message}</span> : null}
      </div>
    );
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="companyId" value={companyId} />
      {FIELDS.map(([k, label, ph]) => (
        <label key={k} className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">{label}</span>
          <input name={k} defaultValue={details[k] ?? ""} placeholder={ph} required={k === "name"} className="border border-border bg-transparent px-2 py-1 font-sans text-sm text-text-primary" />
        </label>
      ))}
      <p className="font-mono text-[10px] text-text-secondary">Ime se pokaže tudi na ponudbi (»Za:«) in v namenu plačila. E-naslove urejaš v razdelku Stik in e-mail.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="border border-accent bg-accent px-3 py-1 font-mono text-xs font-bold uppercase tracking-widest text-black disabled:opacity-60">
          {busy ? "Shranjujem…" : "> Shrani"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="font-mono text-[10px] uppercase tracking-widest text-text-secondary hover:text-text-primary">
          Prekliči
        </button>
        {state && !state.ok ? <span className="font-mono text-[10px] text-danger-text">{state.message}</span> : null}
      </div>
    </form>
  );
}

/** "Testno podjetje" switch on the company page (TASK-016). */
export function TestToggle({ companyId, isTest }: { companyId: string; isTest: boolean }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(setTestAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="isTest" value={isTest ? "0" : "1"} />
      <button type="submit" disabled={busy} className={small}>
        {busy ? "…" : isTest ? "Ni testno" : "Označi kot testno"}
      </button>
      {state ? <span className={`font-mono text-[10px] ${state.ok ? "text-accent" : "text-danger-text"}`}>{state.message}</span> : null}
    </form>
  );
}

const REASONS = ["agregator (imenik, portal)", "ne obstaja (vrnjen e-mail)", "ni njihov (tuja domena)", "drug razlog"];

/** One e-mail on the company page: mark it wrong with a reason, or valid again (ADR-044). */
export function ContactEmail({ companyId, email, source, invalidReason }: { companyId: string; email: string; source: string | null; invalidReason: string | null }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(invalidReason ? markValidAction : markInvalidAction, null);
  return (
    <li className="font-mono text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className={invalidReason ? "text-text-secondary line-through" : "text-text-primary"}>{email}</span>
        {invalidReason ? <span className="text-[10px] uppercase tracking-widest text-danger-text">napačen · {invalidReason}</span> : null}
      </div>
      {source ? <span className="block text-[10px] text-text-secondary">vir: {source}</span> : null}
      <form action={action} className="mt-1 flex flex-wrap items-center gap-2">
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="email" value={email} />
        {invalidReason ? null : (
          <select name="reason" defaultValue={REASONS[0]} className="border border-border bg-black px-2 py-0.5 font-mono text-[10px] text-text-secondary">
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
        <button type="submit" disabled={busy} className={invalidReason ? small : "border border-danger-text/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-danger-text hover:bg-danger-text hover:text-black"}>
          {busy ? "…" : invalidReason ? "Je pravilen" : "Napačen"}
        </button>
        {state ? <span className={`text-[10px] ${state.ok ? "text-accent" : "text-danger-text"}`}>{state.message}</span> : null}
      </form>
    </li>
  );
}

/** "Pokliči namesto e-maila" switch (ADR-044). */
export function ChannelToggle({ companyId, call }: { companyId: string; call: boolean }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(setChannelAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="channel" value={call ? "email" : "call"} />
      <button type="submit" disabled={busy} className={small}>
        {busy ? "…" : call ? "Nazaj na e-mail" : "Pokliči namesto e-maila"}
      </button>
      {state ? <span className={`font-mono text-[10px] ${state.ok ? "text-accent" : "text-danger-text"}`}>{state.message}</span> : null}
    </form>
  );
}

/** "Ni dosegljiv": hide from Za klic for 2 days. */
export function CallLater({ companyId }: { companyId: string }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(callLaterAction, null);
  if (state?.ok) return <span className="font-mono text-[10px] text-accent">✓ {state.message}</span>;
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="companyId" value={companyId} />
      <button type="submit" disabled={busy} className={small}>
        {busy ? "…" : "Ni dosegljiv, čez 2 dni"}
      </button>
    </form>
  );
}
