import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/server/db/client";
import { listSites } from "@/server/sites/store";
import { STAGE_LABEL, type Stage } from "@/server/sites/stages";

export const dynamic = "force-dynamic";
const KIND: Record<string, string> = { client: "stranka", migration: "selitev", own: "naša" };

export default async function SitesPage() {
  const rows = await listSites(getDb());
  return (
    <>
      <PageHeader
        title="Strani"
        description="Vse strani na našem sistemu in urejevalniku."
        right={
          <div className="flex gap-2">
            <Link href="/strani/registriraj" className="border border-border px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-text-primary hover:border-accent hover:text-accent">
              Registriraj obstoječo
            </Link>
            <Link href="/strani/nova" className="border border-accent bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:bg-transparent hover:text-accent">
              Nova stran
            </Link>
          </div>
        }
      />
      {rows.length === 0 ? (
        <p className="border border-border bg-surface p-5 font-mono text-xs text-text-secondary">&gt; Še ni strani. »Nova stran« ustvari repozitorij iz predloge in pripravi vse za agenta.</p>
      ) : (
        <ul className="border border-border">
          {rows.map(({ s, companyName }) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-4 border-b border-border bg-surface px-5 py-3 last:border-b-0">
              <Link href={`/strani/${s.id}`} className="font-sans text-sm text-text-primary hover:text-accent">
                {companyName}
              </Link>
              <span className="font-mono text-xs text-text-secondary">{s.siteId}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">{KIND[s.kind]}</span>
              {s.registered ? <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">obstoječa{s.legacy ? " · stara arhitektura" : ""}</span> : null}
              <span className="ml-auto font-mono text-xs text-accent">{STAGE_LABEL[s.stage as Stage]}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
