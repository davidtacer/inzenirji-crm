"use client";
import { useActionState } from "react";
import { readAction, saveAction, type ReadState, type SaveState } from "./actions";
import { EMPTY_PREFILL, type Prefill } from "@/lib/prefill";

const btn =
  "border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent disabled:opacity-60";
const ghost = "border border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-text-secondary hover:border-text-primary hover:text-text-primary disabled:opacity-60";
const input = "w-full border border-border bg-black px-3 py-2 font-sans text-sm text-text-primary focus:border-accent focus:outline-none";
const label = "font-mono text-[10px] uppercase tracking-widest text-text-secondary";

const FIELDS: [keyof Prefill, string, string][] = [
  ["name", "Ime podjetja *", "npr. Salon Ana ali ANA NOVAK s.p."],
  ["category", "Dejavnost", "npr. Frizerski salon"],
  ["address", "Naslov", "Gosposka ulica 2, 3000 Celje"],
  ["city", "Kraj", "Celje"],
  ["phone", "Telefon", "041 123 456"],
  ["website", "Spletna stran", "https://… (prazno, če je nima)"],
  ["email", "E-naslov", "info@podjetje.si"],
  ["emailSource", "Vir e-naslova", "povezava, kjer je objavljen (prazno = vnesel lastnik)"],
];

function Msg({ s }: { s: { ok: boolean; message: string } | null }) {
  return s ? <p role="status" className={`font-mono text-xs ${s.ok ? "text-accent" : "text-danger-text"}`}>&gt; {s.message}</p> : null;
}

export function NewCompanyForm({ email = "" }: { email?: string }) {
  const [read, readFn, reading] = useActionState<ReadState, FormData>(readAction, null);
  const [save, saveFn, saving] = useActionState<SaveState, FormData>(saveAction, null);
  const p = read?.prefill ?? { ...EMPTY_PREFILL, email };
  return (
    <div className="flex flex-col gap-6">
      <form action={readFn} className="flex flex-col gap-2 border border-border bg-surface p-5">
        <span className={label}>1. Prilepi povezavo (neobvezno)</span>
        <p className="font-sans text-xs text-text-secondary">Stran podjetja na bizi.si ali njihova spletna stran. Prebrano se vpiše v obrazec spodaj.</p>
        <div className="flex flex-col gap-2 md:flex-row">
          <input name="url" placeholder="https://www.bizi.si/IME-PODJETJA/" className={input} />
          <button type="submit" disabled={reading} className={`${ghost} whitespace-nowrap`}>
            {reading ? "Berem…" : "Preberi"}
          </button>
        </div>
        <Msg s={read} />
      </form>

      {/* key: refill the fields after every read */}
      <form key={read?.key ?? 0} action={saveFn} className="flex flex-col gap-4 border border-border bg-surface p-5">
        <span className={label}>2. Preveri in shrani</span>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {FIELDS.map(([k, l, ph]) => (
            <label key={k} className="flex flex-col gap-1">
              <span className={label}>{l}</span>
              <input name={k} defaultValue={p[k]} placeholder={ph} required={k === "name"} type={k === "email" ? "email" : "text"} className={input} />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className={btn}>
            {saving ? "Shranjujem in raziskujem…" : "> Shrani in raziskuj"}
          </button>
          <Msg s={save} />
        </div>
      </form>
    </div>
  );
}
