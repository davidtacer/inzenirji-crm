import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ScoreBadge } from "@/components/ScoreBadge";
import { GROUP_LABEL } from "@/lib/labels";
import { getDb } from "@/server/db/client";
import { createDueFollowUps, dueFollowUpCount, listDrafts } from "@/server/outreach/drafts";
import { jobView } from "@/lib/jobs";
import { latestJob, runningJob, startJob } from "@/server/jobs";
import { JobLine } from "../podjetja/buttons";
import { lockReason, outreachConfig, sentToday, sentTodayByKind } from "@/server/outreach/send";
import { getSettings } from "@/server/settings";
import { ApprovedDraftActions, PendingDraftForm } from "./forms";
import { aiConfig, spentTodayMicroUsd } from "@/server/ai/remark";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { first: "1. e-mail", followup_1: "Follow-up (3. dan)", followup_2: "Zadnji follow-up (8. dan)", reply: "Odgovor" };
const when = (d: Date | null) => (d ? d.toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana", dateStyle: "short", timeStyle: "short" }) : "—");

function Head({ d }: { d: { companyId: string; companyName: string; group: "A" | "B" | null; score: number | null; kind: string; toEmail: string } }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-3">
      <ScoreBadge score={d.score} />
      <Link href={`/podjetja/${d.companyId}`} className="font-sans text-sm text-text-primary hover:text-accent">
        {d.companyName}
      </Link>
      {d.group ? <span className="font-mono text-[10px] text-accent">{GROUP_LABEL[d.group]}</span> : null}
      <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">{KIND[d.kind]}</span>
      <span className="ml-auto font-mono text-xs text-text-secondary">→ {d.toEmail}</span>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{`// ${title} (${count})`}</h2>
      {children}
    </section>
  );
}

export default async function DraftsPage() {
  const db = getDb();
  const st = await getSettings(db);
  const ai = aiConfig(st);
  // Due follow-ups are written by AI for each company (ADR-048): in the background, so the page opens at once.
  const due = await dueFollowUpCount(db);
  if (due && !(await runningJob(db, ["followups"]))) {
    await startJob(db, { kind: "followups" }, async () => {
      const n = await createDueFollowUps(db, new Date(), ai);
      return `Pripravljenih follow-upov: ${n}.`;
    });
  }
  const fuJob = await latestJob(db, ["followups"], undefined, 10 * 60_000);
  const [d, today, byKind, aiSpent] = await Promise.all([listDrafts(db), sentToday(db), sentTodayByKind(db), spentTodayMicroUsd(db)]);
  const cfg = outreachConfig(st);
  const lock = lockReason(st);
  return (
    <>
      <PageHeader title="Osnutki" description="Nič ne gre ven brez tvoje odobritve. Uredi, odobri, nato pošlji." />

      <div className={`mb-8 border p-4 font-mono text-xs ${lock ? "border-[#F0B429]/60 text-[#F0B429]" : "border-accent/50 text-accent"}`}>
        {lock ? <p>&gt; {lock}</p> : <p>&gt; Pošiljanje je vklopljeno s david@inzenirji.si.</p>}
        <p className="mt-1">
          <Link href="/nastavitve" className="text-text-secondary underline hover:text-accent">
            Spremeni v Nastavitvah →
          </Link>
        </p>
        <p className="mt-1 text-text-secondary">
          Danes poslanih: {today} / {cfg.dailyCap} (prvi e-maili: {byKind.first}, follow-upi: {byKind.followUps}; odgovori se ne štejejo) · odjava je v vsakem
          e-mailu (stavek + glava List-Unsubscribe)
        </p>
        <p className="mt-1 text-text-secondary">
          Omejitev šteje vse hladne e-maile, ker za ugled domene inzenirji.si šteje skupno število. Dvigni jo postopoma v Nastavitvah (+5 na teden, dokler ni
          zavrnjenih).
        </p>
        <p className="mt-1 text-text-secondary">
          {ai
            ? `AI opazka: vklopljena (${ai.model}) · zadnjih 24 h ${(aiSpent / 1e6).toFixed(2)} $ od ${(ai.dailyBudgetMicroUsd / 1e6).toFixed(2)} $`
            : "AI: izklopljen (ni ključa ANTHROPIC_API_KEY ali omejitev 0 $ v Nastavitvah) — besedila so iz pravil"}
        </p>
      </div>

      {fuJob ? (
        <div className="mb-6">
          <JobLine job={jobView(fuJob)} label="AI piše follow-upe za vsako podjetje posebej" />
        </div>
      ) : null}

      <Section title="Za odobritev" count={d.pending.length}>
        {d.pending.length === 0 ? (
          <p className="border border-border bg-surface p-5 font-mono text-xs text-text-secondary">
            &gt; Ni osnutkov. Pripravi jih na strani{" "}
            <Link href="/" className="text-accent hover:underline">
              Danes
            </Link>{" "}
            ali na strani podjetja.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {d.pending.map((x) => (
              <article key={x.id} className="border border-border bg-surface">
                <Head d={x} />
                <div className="p-5">
                  {x.writtenBy ? (
                    <p className={`mb-3 font-mono text-[10px] uppercase tracking-widest ${x.writtenBy.startsWith("ai:") ? "text-accent" : "text-[#F0B429]"}`}>
                      {x.writtenBy.startsWith("ai:") ? "Napisal AI za to podjetje" : `Predloga - ${x.writtenBy.replace(/^predloga:\s*/, "")}`}
                    </p>
                  ) : null}
                  <PendingDraftForm id={x.id} subject={x.subject} body={x.body} toEmail={x.toEmail} emails={d.emails[x.companyId] ?? []} />
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>

      <Section title="Odobreni — čakajo na pošiljanje" count={d.approved.length}>
        <div className="flex flex-col gap-4">
          {d.approved.map((x) => (
            <article key={x.id} className="border border-border bg-surface">
              <Head d={x} />
              <div className="p-5">
                <p className="mb-2 font-sans text-sm text-text-primary">{x.subject}</p>
                <pre className="mb-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-text-secondary">{x.body}</pre>
                <ApprovedDraftActions id={x.id} locked={!!lock} />
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Poslani (zadnjih 30)" count={d.sent.length}>
        {d.sent.length ? (
          <div className="border border-border">
            {d.sent.map((x) => (
              <div key={x.id} className="flex flex-wrap gap-x-4 border-b border-border bg-surface px-5 py-3 last:border-b-0">
                <span className="font-mono text-xs text-text-secondary">{when(x.sentAt)}</span>
                <Link href={`/podjetja/${x.companyId}`} className="font-sans text-sm text-text-primary hover:text-accent">
                  {x.companyName}
                </Link>
                <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">{KIND[x.kind]}</span>
                <span className="ml-auto font-mono text-xs text-text-secondary">{x.toEmail}</span>
              </div>
            ))}
          </div>
        ) : null}
      </Section>
    </>
  );
}
