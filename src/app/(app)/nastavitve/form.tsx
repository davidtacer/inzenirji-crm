"use client";
import { useActionState } from "react";
import type { Settings } from "@/server/settings";
import { saveSettingsAction, type SaveState } from "./actions";

const input = "w-full border border-border bg-black px-3 py-2 font-sans text-sm text-text-primary focus:border-accent focus:outline-none";
const label = "font-mono text-[10px] uppercase tracking-widest text-text-secondary";
const help = "font-sans text-xs text-text-secondary";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-surface">
      <h2 className="border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{`// ${title}`}</h2>
      <div className="flex flex-col gap-5 p-5">{children}</div>
    </section>
  );
}

function Field({ name, title, hint, value, type = "text", placeholder }: { name: keyof Settings; title: string; hint: string; value: string | number; type?: string; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={label}>{title}</span>
      <input name={name} defaultValue={value} type={type} step={type === "number" ? "any" : undefined} placeholder={placeholder} className={input} />
      <span className={help}>{hint}</span>
    </label>
  );
}

export function SettingsForm({ s }: { s: Settings }) {
  const [state, action, busy] = useActionState<SaveState, FormData>(saveSettingsAction, null);
  return (
    <form action={action} className="flex flex-col gap-6">
      <Section title="Pošiljanje e-mailov">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="sendingEnabled" defaultChecked={s.sendingEnabled} className="mt-1 h-4 w-4 accent-[#00FF41]" />
          <span className="flex flex-col gap-1">
            <span className="font-sans text-sm text-text-primary">Pošiljanje vklopljeno</span>
            <span className={help}>
              Odklene gumb »Pošlji« v Osnutkih. Nič se ne pošlje samo — vsak e-mail pošlješ s klikom. Vklopi šele, ko mail-tester pokaže DKIM podpis.
            </span>
          </span>
        </label>
        <Field name="dailySendCap" title="Največ hladnih e-mailov na dan" type="number" value={s.dailySendCap} hint="Začni z 10, dvigni počasi (do 50), dokler je nedostavljenih manj kot 3 %. Odgovori strankam se ne štejejo." />
      </Section>

      <Section title="Kontakt v odgovorih">
        <Field name="bookingUrl" title="Povezava za termin" value={s.bookingUrl} placeholder="https://calendar.app.google/…" hint="Google Koledar → Razpored terminov → Deli. Če je vpisana, jo odgovori ponudijo prvo." />
        <Field name="ownerPhone" title="Tvoj telefon" value={s.ownerPhone} placeholder="041 123 456" hint="Če ni povezave za termin, odgovor ponudi to številko. Prazno = stranko prosimo za njeno številko." />
      </Section>

      <Section title="Podatki za ponudbe in plačila">
        <Field name="sellerName" title="Ime podjetja" value={s.sellerName} placeholder="David Tacer s.p." hint="Kot je registrirano (AJPES)." />
        <Field name="sellerStreet" title="Ulica in hišna št." value={s.sellerStreet} placeholder="Ulica 1" hint="" />
        <Field name="sellerCity" title="Pošta in kraj" value={s.sellerCity} placeholder="2000 Maribor" hint="" />
        <Field name="sellerTaxId" title="Davčna številka" value={s.sellerTaxId} placeholder="SI12345678" hint="Prikaže se na ponudbi." />
        <Field name="iban" title="IBAN" value={s.iban} placeholder="SI56 0000 0000 0000 000" hint="Za predplačilo in UPN QR kodo na ponudbi." />
        <label className="flex items-start gap-3">
          <input type="checkbox" name="vatPayer" defaultChecked={s.vatPayer} className="mt-1 h-4 w-4 accent-[#00FF41]" />
          <span className="flex flex-col gap-1">
            <span className="font-sans text-sm text-text-primary">Zavezanec za DDV (22 %)</span>
            <span className={help}>Če nisi, ponudba pokaže »DDV ni obračunan na podlagi 1. odstavka 94. člena ZDDV-1«. Preveri z računovodjo.</span>
          </span>
        </label>
        <Field name="proposalValidDays" title="Ponudba velja (dni)" type="number" value={s.proposalValidDays} hint="Privzeto 14." />
      </Section>

      <Section title="Raziskava">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="webSearchEnabled" defaultChecked={s.webSearchEnabled} className="mt-1 h-4 w-4 accent-[#00FF41]" />
          <span className="flex flex-col gap-1">
            <span className="font-sans text-sm text-text-primary">Iskanje po spletu</span>
            <span className={help}>
              Raziskava poišče spletno stran, profile, imenike in e-naslove tudi na spletu (kot ko podjetje poguglaš). Vsako najdbo preverimo. Strošek ≈ 3–8 centov na podjetje, šteje v AI omejitev.
            </span>
          </span>
        </label>
      </Section>

      <Section title="Omejitve stroškov">
        <Field name="aiDailyBudgetUsd" title="AI na 24 ur (USD)" type="number" value={s.aiDailyBudgetUsd} hint="Opazke, razvrščanje in odgovori. 0 = AI izklopljen (uporabijo se pravila). Ena opazka ≈ 0,5–1 cent." />
        <Field name="placesDailyCap" title="Google Places klicev na dan" type="number" value={s.placesDailyCap} hint="Iskanje, profili in konkurenti. Ponastavi se ob polnoči." />
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent disabled:opacity-60"
        >
          {busy ? "Shranjujem…" : "> Shrani"}
        </button>
        {state ? <p role="status" className={`font-mono text-xs ${state.ok ? "text-accent" : "text-danger-text"}`}>&gt; {state.message}</p> : null}
      </div>
    </form>
  );
}
