import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/server/db/client";
import { getSettings } from "@/server/settings";
import { SettingsForm } from "./form";
import { getAccount } from "@/server/google/calendar";
import { oauthConfigFromEnv } from "@/server/google/oauth";
import { formatLj } from "@/lib/time";
import { DisconnectGoogle } from "./google";
import { DemoLeadsCard } from "./demo";
import { demoTokenInfo } from "@/server/demo/demo";

export const dynamic = "force-dynamic";

const KEYS: [string, string][] = [
  ["GOOGLE_PLACES_API_KEY", "Google Places"],
  ["ANTHROPIC_API_KEY", "Claude (AI)"],
  ["OUTREACH_SMTP_PASSWORD", "Nabiralnik david@inzenirji.si"],
  ["SMTP_PASSWORD", "Prijavni e-maili (hello@)"],
  ["GOOGLE_OAUTH_CLIENT_SECRET", "Google prijava (koledar)"],
];

const GOOGLE_MSG: Record<string, [boolean, string]> = {
  ok: [true, "Google Koledar je povezan."],
  zavrnjeno: [false, "Povezava je bila preklicana na Googlu."],
  napaka: [false, "Povezava ni uspela. Poskusi znova."],
  manjka: [false, "Na strežniku manjkata GOOGLE_OAUTH_CLIENT_ID in GOOGLE_OAUTH_CLIENT_SECRET."],
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const db = getDb();
  const s = await getSettings(db);
  const acc = await getAccount(db);
  const demo = await demoTokenInfo(db);
  const ready = !!oauthConfigFromEnv();
  const g = GOOGLE_MSG[(await searchParams).google ?? ""];
  return (
    <>
      <PageHeader title="Nastavitve" description="Spremembe veljajo takoj, brez ponovne postavitve." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
        <SettingsForm s={s} />
        <div className="flex flex-col gap-6">
        <aside className="h-fit border border-border bg-surface p-5">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{"// Google Koledar"}</h2>
          {g ? <p className={`mb-3 font-mono text-xs ${g[0] ? "text-accent" : "text-danger-text"}`}>&gt; {g[1]}</p> : null}
          {acc ? (
            <div className="flex flex-col gap-2 font-sans text-xs text-text-secondary">
              <p>
                Povezan: <span className="text-accent">{acc.email}</span>
              </p>
              <p>Zadnje branje: {formatLj(acc.lastSyncAt)}</p>
              {acc.lastError ? <p className="text-danger-text">{acc.lastError}</p> : null}
              <p>Rezervacije iz koledarja (npr. razpored terminov) se same vpišejo kot dogovorjen klic, če je udeleženec podjetje iz CRM.</p>
              <DisconnectGoogle />
            </div>
          ) : (
            <div className="flex flex-col gap-3 font-sans text-xs text-text-secondary">
              <p>CRM bo samo bral koledar (rezervacije klicev). Ničesar ne spreminja.</p>
              {ready ? (
                <a
                  href="/api/google/connect"
                  className="w-fit border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent"
                >
                  &gt; Poveži Google Koledar
                </a>
              ) : (
                <p className="text-danger-text">Najprej dodaj GOOGLE_OAUTH_CLIENT_ID in GOOGLE_OAUTH_CLIENT_SECRET (navodila v klepetu / CHEATSHEET).</p>
              )}
            </div>
          )}
        </aside>
        <aside className="h-fit border border-border bg-surface p-5">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{"// Leadi s spleta (demo + obrazec)"}</h2>
          <DemoLeadsCard createdAt={demo ? formatLj(demo.createdAt, false) : null} />
        </aside>
        <aside className="h-fit border border-border bg-surface p-5">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{"// Ključi in gesla"}</h2>
          <p className="mb-4 font-sans text-xs text-text-secondary">Zaradi varnosti so na GitHubu (okolje prod), ne v CRM. Tu vidiš samo, ali so nastavljeni.</p>
          <ul className="flex flex-col gap-2 font-mono text-xs">
            {KEYS.map(([k, l]) => (
              <li key={k} className="flex justify-between gap-3">
                <span className="text-text-secondary">{l}</span>
                <span className={process.env[k] ? "text-accent" : "text-danger-text"}>{process.env[k] ? "✓ nastavljen" : "✗ manjka"}</span>
              </li>
            ))}
          </ul>
        </aside>
        </div>
      </div>
    </>
  );
}
