import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { formatLj } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { eur, listProposals, totals, type Item } from "@/server/proposals/proposals";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

const STATUS: Record<string, [string, string]> = {
  draft: ["OSNUTEK", "text-text-secondary"],
  sent: ["POSLANA", "text-[#F0B429]"],
  accepted: ["SPREJETA", "text-accent"],
  declined: ["ZAVRNJENA", "text-danger-text"],
};

export default async function ProposalsPage() {
  const db = getDb();
  const [rows, st] = await Promise.all([listProposals(db), getSettings(db)]);
  return (
    <>
      <PageHeader title="Ponudbe" description="Ponudbe se pripravijo na strani podjetja (okvir Prodaja) po klicu." />
      {rows.length === 0 ? (
        <p className="border border-border bg-surface p-5 font-mono text-xs text-text-secondary">&gt; Še ni ponudb.</p>
      ) : (
        <ul className="border border-border">
          {rows.map((r) => {
            const t = totals(r.p.items as Item[], r.p.vatRateBp, st.vatPayer, r.p.depositPct);
            const [label, tone] = STATUS[r.p.status];
            return (
              <li key={r.p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface px-5 py-3 last:border-b-0">
                <span className={`w-24 font-mono text-[10px] tracking-widest ${tone}`}>{label}</span>
                <Link href={`/ponudbe/${r.p.id}`} className="font-sans text-sm text-text-primary hover:text-accent">
                  {r.companyName}
                </Link>
                <span className="font-mono text-xs text-text-secondary">{eur(t.gross)}</span>
                <span className="ml-auto font-mono text-xs text-text-secondary">
                  {r.p.viewCount ? `odprta ${r.p.viewCount}× · zadnjič ${formatLj(r.p.lastViewedAt)}` : r.p.status === "sent" ? "še ni odprta" : ""}
                  {r.stage === "won" ? " · STRANKA" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
