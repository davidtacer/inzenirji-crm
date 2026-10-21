import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { REPLY_LABEL, REPLY_TONE } from "@/lib/replyLabels";
import { getDb } from "@/server/db/client";
import { ownText } from "@/server/mailbox/classify";
import { listInbound } from "@/server/mailbox/process";
import { lastSync, syncMailbox } from "@/server/mailbox/sync";
import { SyncButton } from "./sync-button";
import { listHeld, VERDICT_LABEL } from "@/server/leads/guard";
import { ReleaseHeldButton } from "./held";

export const dynamic = "force-dynamic";

const when = (d: Date | null) => (d ? d.toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana", dateStyle: "short", timeStyle: "short" }) : "še nikoli");

const EFFECT: Record<string, string> = {
  interested: "follow-upi ustavljeni · osnutek odgovora pripravljen",
  question: "follow-upi ustavljeni · osnutek odgovora pripravljen (dopolni odgovor)",
  not_now: "ponovni stik čez 90 dni",
  no: "trajno na seznamu »ne kontaktiraj«",
  out_of_office: "zaporedje teče naprej",
  bounce: "naslov ne deluje · označen kot napačen, follow-upi ustavljeni · brez drugega naslova je podjetje v seznamu Za klic",
};

export default async function RepliesPage() {
  const db = getDb();
  // Read new mail when the page opens, at most every 2 minutes.
  const status = await syncMailbox(db, { minAgeMs: 120_000 });
  const [rows, at, held] = await Promise.all([listInbound(db), lastSync(db), listHeld(db)]);
  return (
    <>
      <PageHeader title="Odgovori" description="Odgovori podjetij iz baze na david@inzenirji.si. Drugih e-mailov CRM ne shrani." right={<SyncButton />} />
      <p className={`mb-6 font-mono text-xs ${status.ok === false ? "text-danger-text" : "text-text-secondary"}`}>
        &gt; {status.ok === false ? status.message : `Nabiralnik nazadnje prebran: ${when(at)}`}
      </p>
      {held.length ? (
        <details className="mb-6 border border-border bg-surface">
          <summary className="cursor-pointer px-5 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[#F0B429]">
            {`// Zadržano z obrazca (${held.length}) - smeti, prevare, žalitve, testi`}
          </summary>
          <div className="flex flex-col divide-y divide-border border-t border-border">
            {held.map((h) => (
              <div key={h.id} className="flex flex-col gap-2 px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="border border-[#F0B429]/60 px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-[#F0B429]">
                    {VERDICT_LABEL[h.verdict as keyof typeof VERDICT_LABEL] ?? h.verdict}
                  </span>
                  <span className="font-sans text-sm text-text-primary">{h.name}</span>
                  <span className="font-mono text-xs text-text-secondary">{h.email}</span>
                  <span className="ml-auto font-mono text-xs text-text-secondary">{when(h.at)}</span>
                </div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">Zakaj: {h.reason}</p>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-text-secondary">{h.message.slice(0, 800) || "(prazno)"}</pre>
                <ReleaseHeldButton id={h.id} />
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {rows.length === 0 ? (
        <p className="border border-border bg-surface p-5 font-mono text-xs text-text-secondary">&gt; Še ni odgovorov.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <article key={r.id} className="border border-border bg-surface">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-3">
                <span className={`border px-1.5 py-0.5 font-mono text-[10px] tracking-widest ${REPLY_TONE[r.classification ?? "question"]}`}>{REPLY_LABEL[r.classification ?? "question"]}</span>
                <Link href={`/podjetja/${r.companyId}`} className="font-sans text-sm text-text-primary hover:text-accent">
                  {r.companyName}
                </Link>
                <span className="font-mono text-xs text-text-secondary">{r.fromEmail}</span>
                <span className="ml-auto font-mono text-xs text-text-secondary">{when(r.receivedAt)}</span>
              </div>
              <div className="p-5">
                <p className="mb-2 font-sans text-sm text-text-primary">{r.subject}</p>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-text-secondary">{ownText(r.bodyText).slice(0, 1200) || "(prazno)"}</pre>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                  {EFFECT[r.classification ?? "question"]}
                  {r.classifiedBy !== "rule" ? ` · razvrstil: ${r.classifiedBy === "default" ? "privzeto (preveri)" : "AI"}` : ""}
                  {r.replyDraftStatus === "pending" ? (
                    <>
                      {" · "}
                      <Link href="/osnutki" className="text-accent hover:underline">
                        odgovor čaka v Osnutkih →
                      </Link>
                    </>
                  ) : r.replyDraftStatus === "sent" ? (
                    " · odgovorjeno"
                  ) : null}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
