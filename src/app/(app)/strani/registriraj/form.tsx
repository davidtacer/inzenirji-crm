"use client";
import { useActionState } from "react";
import { registerSiteAction, type ActionState } from "../actions";

const input = "w-full border border-border bg-black px-3 py-2 font-sans text-sm text-text-primary focus:border-accent focus:outline-none";
const label = "font-mono text-[10px] uppercase tracking-widest text-text-secondary";
const Field = ({ l, children, hint }: { l: string; children: React.ReactNode; hint?: string }) => (
  <label className="flex flex-col gap-1">
    <span className={label}>{l}</span>
    {children}
    {hint ? <span className="font-sans text-[11px] text-text-secondary">{hint}</span> : null}
  </label>
);

export function RegisterForm({ names }: { names: string[] }) {
  const [state, action, busy] = useActionState<ActionState, FormData>(registerSiteAction, null);
  return (
    <form action={action} className="grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
      <Field l="Podjetje" hint="Če ga ni v bazi, ga ustvarimo (kraj, telefon, e-naslov spodaj).">
        <input name="companyName" list="names" required className={input} />
        <datalist id="names">{names.map((n) => <option key={n} value={n} />)}</datalist>
      </Field>
      <Field l="Vrsta">
        <select name="kind" defaultValue="client" className={input}>
          <option value="client">Stranka</option>
          <option value="migration">Selitev obstoječe strani</option>
          <option value="own">Naša lastna stran</option>
        </select>
      </Field>
      <Field l="Domena" hint="npr. vodniskuter.si">
        <input name="domain" required className={input} />
      </Field>
      <Field l="ID strani (neobvezno)" hint="Privzeto iz domene, npr. vodniskuter-si.">
        <input name="siteId" className={input} />
      </Field>
      <Field l="Živa stran (URL)" hint="Privzeto https://domena.">
        <input name="liveUrl" className={input} />
      </Field>
      <Field l="Repozitorij (neobvezno)" hint="lastnik/ime, npr. davidtacer/grant-si. Samo se shrani.">
        <input name="repo" className={input} />
      </Field>
      <Field l="Gostovanje" hint="npr. Cloudflare Pages, Hetzner, Vercel">
        <input name="hosting" className={input} />
      </Field>
      <Field l="Urejevalnik">
        <select name="editorState" defaultValue="none" className={input}>
          <option value="none">Ni</option>
          <option value="planned">Načrtovan</option>
          <option value="active">Aktiven</option>
        </select>
      </Field>
      <label className="flex items-center gap-2 font-sans text-sm text-text-primary md:col-span-2">
        <input type="checkbox" name="legacy" /> Stara arhitektura (ni JSON vsebine v content/, npr. WordPress ali stara koda): kandidat za selitev. Stran po novi arhitekturi brez editor.config.json NI stara.
      </label>
      <div className="md:col-span-2">
        <Field l="Uredniki (neobvezno)" hint="Ena vrstica na urednika: e-naslov in po želji »owner«.">
          <textarea name="editors" rows={3} className={input} />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field l="Opombe">
          <textarea name="notes" rows={3} className={input} />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field l="Zasebne opombe (samo CRM)">
          <textarea name="ownerNotes" rows={2} className={input} />
        </Field>
      </div>
      <fieldset className="grid grid-cols-1 gap-3 border border-border p-3 md:col-span-2 md:grid-cols-3">
        <legend className={`${label} px-1`}>Novo podjetje (če ga ni v bazi)</legend>
        <Field l="Kraj"><input name="city" className={input} /></Field>
        <Field l="Telefon"><input name="phone" className={input} /></Field>
        <Field l="E-naslov"><input name="email" type="email" className={input} /></Field>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" disabled={busy} className="border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent disabled:opacity-60">
          {busy ? "…" : "Registriraj"}
        </button>
        {state ? <p role="status" className={`font-mono text-xs ${state.ok ? "text-accent" : "text-danger-text"}`}>&gt; {state.message}</p> : null}
      </div>
    </form>
  );
}
