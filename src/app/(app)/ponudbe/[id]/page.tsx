import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { formatLj } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { eur, getProposal, itemsToText, proposalUrl, totals, type Item } from "@/server/proposals/proposals";
import { getSettings, sellerComplete } from "@/server/settings";
import { EmailProposalButton, PaidButton, ProposalEditor } from "../forms";

export const dynamic = "force-dynamic";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = getDb();
  const r = await getProposal(db, id);
  if (!r) notFound();
  const st = await getSettings(db);
  const p = r.p;
  const t = totals(p.items as Item[], p.vatRateBp, st.vatPayer, p.depositPct);
  const url = proposalUrl(p.token);
  return (
    <>
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
        <Link href={`/podjetja/${r.companyId}`} className="hover:text-accent">
          ← {r.companyName}
        </Link>
      </p>
      <PageHeader title="Ponudba" description={p.title} />
      {!sellerComplete(st) ? (
        <p className="mb-4 border border-[#F0B429]/60 p-3 font-mono text-xs text-[#F0B429]">
          &gt; Najprej v{" "}
          <Link href="/nastavitve" className="underline">
            Nastavitvah
          </Link>{" "}
          izpolni podatke za ponudbo (ime s.p., naslov, IBAN) — brez njih stranka ne vidi podatkov za plačilo.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
        <section className="border border-border bg-surface p-5">
          <ProposalEditor
            v={{
              id: p.id,
              title: p.title,
              intro: p.intro,
              items: itemsToText(p.items as Item[]),
              timelineDays: p.timelineDays,
              depositPct: p.depositPct,
              materials: (p.materials as string[]).join("\n"),
              validUntil: p.validUntil,
              locked: p.status === "accepted",
            }}
          />
        </section>
        <aside className="flex h-fit flex-col gap-4 border border-border bg-surface p-5 font-mono text-xs">
          <p className="text-[10px] uppercase tracking-[0.3em] text-accent">{"// Stanje"}</p>
          <p>
            Status: <span className="text-accent">{{ draft: "osnutek", sent: "poslana", accepted: "SPREJETA", declined: "zavrnjena" }[p.status]}</span>
          </p>
          <p className="text-text-secondary">
            Brez DDV {eur(t.net)}
            {st.vatPayer ? ` · DDV ${eur(t.vat)}` : ""} · skupaj <span className="text-text-primary">{eur(t.gross)}</span>
            <br />
            Predplačilo {p.depositPct} %: {eur(t.deposit)}
          </p>
          <p className="text-text-secondary">
            Poslana: {formatLj(p.sentAt)}
            <br />
            Odprta: {p.viewCount}× {p.firstViewedAt ? `(prvič ${formatLj(p.firstViewedAt)}, zadnjič ${formatLj(p.lastViewedAt)})` : ""}
            {p.acceptedAt ? (
              <>
                <br />
                <span className="text-accent">
                  Sprejel(a): {p.acceptedName} · {formatLj(p.acceptedAt)}
                </span>
              </>
            ) : null}
          </p>
          <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-accent hover:underline">
            Odpri, kot jo vidi stranka ↗
          </a>
          <EmailProposalButton id={p.id} sent={p.status !== "draft"} />
          {p.status === "accepted" ? <PaidButton companyId={r.companyId} /> : null}
        </aside>
      </div>
    </>
  );
}
