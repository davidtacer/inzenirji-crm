"use client";
import { useActionState } from "react";
import { saveSitesAction, testSitesAction } from "./sites-actions";

const field = "w-full border border-border bg-black px-3 py-2 font-mono text-xs text-text-primary";
const lbl = "font-mono text-[10px] uppercase tracking-widest";
type S = { appId: string; installationId: string; owner: string; templateRepo: string; editorConfigRepo: string; siteGuideUrl: string; guideVersion: string; hasKey: boolean; hasToken: boolean };

/** Settings card "Izdelava strani" (TASK-039 §6): GitHub App, template, guide URL. Secrets are never shown again. */
export function SitesCard({ c }: { c: S }) {
  const [state, action, busy] = useActionState<{ ok: boolean; message: string } | null, FormData>(saveSitesAction, null);
  const [test, testAction, testing] = useActionState<{ ok: boolean; message: string } | null>(testSitesAction, null);
  return (
    <div className="flex flex-col gap-3 font-sans text-xs text-text-secondary">
      <details>
        <summary className="cursor-pointer text-accent">Kako ustvarim GitHub App (korak za korakom)</summary>
        <ol className="ml-4 mt-2 list-decimal space-y-1">
          <li>Odpri github.com, klikni svojo sliko (zgoraj desno) → Settings → na dnu levega menija Developer settings → GitHub Apps → New GitHub App.</li>
          <li>GitHub App name: inzenirji-crm-davidtacer (če je zasedeno, dodaj številko). Homepage URL: https://crm.inzenirji.si. Callback URL pusti prazen.</li>
          <li>Webhook: odstrani kljukico pri »Active«.</li>
          <li>Repository permissions: Administration → Read and write; Contents → Read and write; Metadata → Read-only (ostane samo).</li>
          <li>Where can this GitHub App be installed: Only on this account → Create GitHub App.</li>
          <li>Na strani aplikacije prepiši »App ID« v polje spodaj. Pomakni se do »Private keys« → Generate a private key; prenese se .pem datoteka: odpri jo v urejevalniku besedila, kopiraj vse in prilepi v polje »Zasebni ključ«.</li>
          <li>Levo Install App → Install ob svojem računu → »All repositories« → Install. V naslovu brskalnika je na koncu številka (…/installations/12345678): to je Installation ID.</li>
          <li>Spodaj vpiši še povezavo do navodil (siteGuideUrl), klikni Shrani in »Preveri povezavo«. Pričakuješ: »Povezava deluje«.</li>
          <li>Če Preveri deluje, a ustvarjanje repozitorija pri »Začni pripravo« javi 403/404 »Resource not accessible«: GitHub aplikacijam ne dovoli vedno ustvarjati repozitorijev v osebnem računu. Takrat uporabi rezervo: github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token; Repository access: All repositories; Permissions: Administration, Contents → Read and write; prilepi žeton v polje »Rezervni žeton«.</li>
        </ol>
      </details>
      <form action={action} className="flex flex-col gap-3">
        <p>
          App: {c.hasKey && c.appId && c.installationId ? <span className="text-accent">✓ nastavljen</span> : <span className="text-danger-text">✗ manjka</span>} · rezervni žeton: {c.hasToken ? <span className="text-accent">✓ nastavljen (ima prednost)</span> : "ni"}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1"><span className={lbl}>App ID</span><input name="appId" defaultValue={c.appId} className={field} /></label>
          <label className="flex flex-col gap-1"><span className={lbl}>Installation ID</span><input name="installationId" defaultValue={c.installationId} className={field} /></label>
          <label className="flex flex-col gap-1"><span className={lbl}>GitHub račun (lastnik repozitorijev)</span><input name="owner" defaultValue={c.owner} className={field} /></label>
          <label className="flex flex-col gap-1"><span className={lbl}>Verzija navodil</span><input name="guideVersion" defaultValue={c.guideVersion} className={field} /></label>
          <label className="flex flex-col gap-1"><span className={lbl}>Predloga strani (repozitorij)</span><input name="templateRepo" defaultValue={c.templateRepo} className={field} /></label>
          <label className="flex flex-col gap-1"><span className={lbl}>Repozitorij urednikov</span><input name="editorConfigRepo" defaultValue={c.editorConfigRepo} className={field} /></label>
        </div>
        <label className="flex flex-col gap-1"><span className={lbl}>Povezava do navodil (siteGuideUrl)</span><input name="siteGuideUrl" defaultValue={c.siteGuideUrl} placeholder="https://inzenirji.si/doc/…/urejevalnik-navodila.md" className={field} /></label>
        <label className="flex flex-col gap-1">
          <span className={lbl}>{c.hasKey ? "Nov zasebni ključ (pusti prazno, da ostane star)" : "Zasebni ključ (.pem)"}</span>
          <textarea name="privateKey" rows={3} autoComplete="off" className={field} placeholder="-----BEGIN RSA PRIVATE KEY----- …" />
        </label>
        <label className="flex flex-col gap-1">
          <span className={lbl}>Rezervni žeton (neobvezno)</span>
          <input name="token" type="password" autoComplete="off" className={field} placeholder="github_pat_…" />
        </label>
        {c.hasToken ? <label className="flex items-center gap-2"><input type="checkbox" name="removeToken" /> Odstrani rezervni žeton</label> : null}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className="w-fit border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-text-secondary hover:border-accent hover:text-accent">{busy ? "…" : "Shrani"}</button>
        </div>
        {state ? <p className={state.ok ? "text-accent" : "text-danger-text"}>&gt; {state.message}</p> : null}
      </form>
      <form action={testAction} className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={testing} className="w-fit border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-text-secondary hover:border-accent hover:text-accent">{testing ? "…" : "Preveri povezavo"}</button>
        {test ? <p className={test.ok ? "text-accent" : "text-danger-text"}>&gt; {test.message}</p> : null}
      </form>
    </div>
  );
}
