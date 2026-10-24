"use client";
import { useActionState, useState } from "react";
import { createSiteAction, type ActionState } from "../actions";

const input = "w-full border border-border bg-black px-3 py-2 font-sans text-sm text-text-primary focus:border-accent focus:outline-none";
const label = "font-mono text-[10px] uppercase tracking-widest text-text-secondary";
const Field = ({ l, children, hint }: { l: string; children: React.ReactNode; hint?: string }) => (
  <label className="flex flex-col gap-1">
    <span className={label}>{l}</span>
    {children}
    {hint ? <span className="font-sans text-[11px] text-text-secondary">{hint}</span> : null}
  </label>
);

export function NewSiteForm({ names, company, projectId, depositPaid }: { names: string[]; company: { id: string; name: string } | null; projectId?: string | undefined; depositPaid: boolean }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(createSiteAction, null);
  const [kind, setKind] = useState("client");
  const needReason = kind === "client" && !depositPaid;
  return (
    <form action={action} className="grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
      {company ? <input type="hidden" name="companyId" value={company.id} /> : null}
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
      <Field l="Podjetje" hint={company ? undefined : "Če ga ni v bazi, ga ustvarimo (dodaj še kraj, telefon, e-naslov spodaj)."}>
        <input name="companyName" list="names" defaultValue={company?.name ?? ""} readOnly={!!company} required className={input} />
        <datalist id="names">{names.map((n) => <option key={n} value={n} />)}</datalist>
      </Field>
      <Field l="Vrsta">
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={input}>
          <option value="client">Stranka (plačljiva stran)</option>
          <option value="migration">Selitev obstoječe strani</option>
          <option value="own">Naša lastna stran</option>
        </select>
      </Field>
      <Field l="Domena" hint="npr. vodniskuter.si; iz nje nastane ID strani.">
        <input name="domain" className={input} />
      </Field>
      <Field l="ID strani (neobvezno)" hint="a-z, 0-9, -. Po ustvarjanju repozitorija se ne spreminja.">
        <input name="siteId" className={input} />
      </Field>
      <Field l="Trenutna stran (URL)">
        <input name="currentUrl" className={input} />
      </Field>
      <Field l="Jeziki" hint="sl, en …">
        <input name="languages" defaultValue="sl" className={input} />
      </Field>
      {kind !== "own" ? (
        <Field l="Cena (€)">
          <input name="priceEur" inputMode="decimal" className={input} />
        </Field>
      ) : null}
      <Field l="Rok">
        <input name="deadline" type="date" className={input} />
      </Field>
      <Field l="Kontakt pri stranki (ime, e-naslov, telefon)">
        <textarea name="contact" rows={2} className={input} />
      </Field>
      <Field l="Obseg in posebnosti (rezervacije, jeziki, trgovina …)">
        <textarea name="features" rows={2} className={input} />
      </Field>
      <div className="md:col-span-2">
        <Field l="Opombe za agenta (ton, kaj je narobe na stari strani, želje)" hint="To gre v BRIEF.md in ga vidi agent.">
          <textarea name="notes" rows={4} className={input} />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field l="Zasebne opombe (samo CRM)" hint="Nikoli ne gredo v repozitorij ali k agentu.">
          <textarea name="ownerNotes" rows={2} className={input} />
        </Field>
      </div>
      {needReason ? (
        <div className="md:col-span-2">
          <Field l="Razlog za začetek brez predplačila" hint="Obvezno za stranko brez prejetega predplačila (zapiše se v dnevnik).">
            <input name="startReason" required className={input} />
          </Field>
        </div>
      ) : null}
      <label className="flex items-center gap-2 font-sans text-sm text-text-primary">
        <input type="checkbox" name="hasCgp" /> CGP že obstaja
      </label>
      {!company ? (
        <fieldset className="grid grid-cols-1 gap-3 border border-border p-3 md:col-span-2 md:grid-cols-3">
          <legend className={`${label} px-1`}>Novo podjetje (če ga ni v bazi)</legend>
          <Field l="Kraj"><input name="city" className={input} /></Field>
          <Field l="Telefon"><input name="phone" className={input} /></Field>
          <Field l="E-naslov"><input name="email" type="email" className={input} /></Field>
        </fieldset>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" disabled={busy} className="border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent disabled:opacity-60">
          {busy ? "…" : "Ustvari"}
        </button>
        {state ? <p role="status" className={`font-mono text-xs ${state.ok ? "text-accent" : "text-danger-text"}`}>&gt; {state.message}</p> : null}
      </div>
    </form>
  );
}
