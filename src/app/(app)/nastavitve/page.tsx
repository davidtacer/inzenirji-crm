import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/server/db/client";
import { getSettings } from "@/server/settings";
import { SettingsForm } from "./form";

export const dynamic = "force-dynamic";

const KEYS: [string, string][] = [
  ["GOOGLE_PLACES_API_KEY", "Google Places"],
  ["ANTHROPIC_API_KEY", "Claude (AI)"],
  ["OUTREACH_SMTP_PASSWORD", "Nabiralnik david@inzenirji.si"],
  ["SMTP_PASSWORD", "Prijavni e-maili (hello@)"],
];

export default async function SettingsPage() {
  const s = await getSettings(getDb());
  return (
    <>
      <PageHeader title="Nastavitve" description="Spremembe veljajo takoj, brez ponovne postavitve." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
        <SettingsForm s={s} />
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
    </>
  );
}
