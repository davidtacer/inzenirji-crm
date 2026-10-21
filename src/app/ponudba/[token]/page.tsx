import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { eur, openProposal, totals, type Item } from "@/server/proposals/proposals";
import { upnQrSvg } from "@/server/proposals/upn";
import { getSettings, sellerComplete } from "@/server/settings";
import { AcceptForm, PrintButton } from "./accept";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ponudba · inženirji.si", robots: { index: false, follow: false } };

const date = (d: string | Date) => new Date(d).toLocaleDateString("sl-SI", { timeZone: "Europe/Ljubljana", day: "numeric", month: "numeric", year: "numeric" });

/** The client's view of a proposal (TASK-013, ADR-031). No login: the unguessable token is the access. */
export default async function PublicProposal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  const owner = !!(await getCurrentUser());
  const r = await openProposal(db, token, { owner });
  if (!r) notFound();
  const p = r.p;
  const st = await getSettings(db);
  const items = p.items as Item[];
  const t = totals(items, p.vatRateBp, st.vatPayer, p.depositPct);
  // Stable 8-digit reference from the proposal id, so the payment can be matched to it.
  const ref = `SI00 ${String(parseInt(p.id.replace(/-/g, "").slice(0, 8), 16) % 100_000_000).padStart(8, "0")}`;
  const due = new Date(Date.parse(`${p.validUntil}T12:00:00Z`));
  const qr = sellerComplete(st) && t.deposit > 0
    ? await upnQrSvg({ amountCents: t.deposit, purpose: `Predplačilo ${p.depositPct}% - ${r.company.name}`, dueDate: due, iban: st.iban, reference: ref, name: st.sellerName, street: st.sellerStreet, city: st.sellerCity })
    : null;
  const expired = p.validUntil < new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-[#EAEAEA] print:bg-white print:text-black">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        {owner && p.status === "draft" ? <p className="border border-[#F0B429] p-3 font-mono text-xs text-[#F0B429] print:hidden">&gt; Predogled osnutka (stranka ga še ne vidi).</p> : null}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#222] pb-6">
          <div>
            <p className="font-mono text-sm font-bold text-[#00FF41]">inženirji.si</p>
            <h1 className="mt-3 font-mono text-2xl font-extrabold">{p.title}</h1>
            <p className="mt-2 font-mono text-xs text-[#888]">
              Za: {r.company.name}
              {r.company.address ? ` · ${r.company.address}` : ""} · izdano {date(p.sentAt ?? p.createdAt)} · velja do {date(p.validUntil)}
            </p>
          </div>
          <PrintButton />
        </header>

        {p.intro ? <p className="font-sans text-[16px] leading-relaxed">{p.intro}</p> : null}

        <section>
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[#00FF41]">{"// Postavke"}</h2>
          <table className="w-full border-collapse font-sans text-sm">
            <tbody>
              {items.map((i, n) => (
                <tr key={n} className="border-b border-[#222]">
                  <td className="py-3 pr-4">{i.label}</td>
                  <td className="py-3 text-right font-mono whitespace-nowrap">{i.priceCents > 0 ? eur(i.priceCents) : "vključeno"}</td>
                </tr>
              ))}
              <tr>
                <td className="pt-3 text-right font-mono text-xs text-[#888]">Skupaj brez DDV</td>
                <td className="pt-3 text-right font-mono">{eur(t.net)}</td>
              </tr>
              {st.vatPayer ? (
                <tr>
                  <td className="text-right font-mono text-xs text-[#888]">DDV {(p.vatRateBp / 100).toLocaleString("sl-SI")} %</td>
                  <td className="text-right font-mono">{eur(t.vat)}</td>
                </tr>
              ) : null}
              <tr>
                <td className="pt-2 text-right font-mono text-sm font-bold">Za plačilo</td>
                <td className="whitespace-nowrap pt-2 pl-4 text-right font-mono text-lg font-bold text-[#00FF41] print:text-black">{eur(t.gross)}</td>
              </tr>
            </tbody>
          </table>
          {!st.vatPayer ? <p className="mt-2 font-mono text-[10px] text-[#888]">DDV ni obračunan na podlagi 1. odstavka 94. člena ZDDV-1.</p> : null}
        </section>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[#00FF41]">{"// Rok in garancija"}</h2>
            <p className="font-sans text-sm leading-relaxed">
              Stran je na spletu v <b>{p.timelineDays} dneh</b> od prejema vseh potrebnih materialov. Če ni, vam vrnemo predplačilo.
            </p>
            <p className="mt-2 font-sans text-xs leading-relaxed text-[#888]">
              Rok začne teči, ko pisno potrdimo, da smo prejeli vse materiale s seznama. Med čakanjem na vaše odgovore rok miruje. Garancija ne velja za
              zamude tretjih oseb (npr. prenos domene) in za dodatne funkcije, dogovorjene posebej.
            </p>
          </div>
          <div>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[#00FF41]">{"// Kaj potrebujemo od vas"}</h2>
            <ul className="list-disc pl-5 font-sans text-sm leading-relaxed">
              {(p.materials as string[]).map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[#00FF41]">{"// Plačilo"}</h2>
          <p className="font-sans text-sm leading-relaxed">
            {p.depositPct} % predplačila ob potrditvi ({eur(t.deposit)}), preostanek ob objavi strani.
          </p>
          {sellerComplete(st) ? (
            <div className="mt-4 flex flex-wrap items-start gap-6">
              {qr ? <div className="w-44 bg-white p-1" dangerouslySetInnerHTML={{ __html: qr }} /> : null}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs">
                <dt className="text-[#888]">Prejemnik</dt>
                <dd>
                  {st.sellerName}, {st.sellerStreet}, {st.sellerCity}
                </dd>
                <dt className="text-[#888]">IBAN</dt>
                <dd>{st.iban.replace(/(.{4})/g, "$1 ").trim()}</dd>
                <dt className="text-[#888]">Referenca</dt>
                <dd>{ref}</dd>
                <dt className="text-[#888]">Znesek</dt>
                <dd>{eur(t.deposit)}</dd>
                <dt className="text-[#888]">Namen</dt>
                <dd>Predplačilo – {r.company.name}</dd>
                {st.sellerTaxId ? (
                  <>
                    <dt className="text-[#888]">Davčna št.</dt>
                    <dd>{st.sellerTaxId}</dd>
                  </>
                ) : null}
              </dl>
            </div>
          ) : null}
          {qr ? <p className="mt-2 font-mono text-[10px] text-[#888]">QR kodo skenirate v mobilni banki (UPN QR).</p> : null}
        </section>

        <section className="border-t border-[#222] pt-6 print:hidden">
          {p.status === "accepted" ? (
            <p className="border border-[#00FF41] p-4 font-mono text-sm text-[#00FF41]">
              &gt; Ponudba je potrjena ({p.acceptedName}, {date(p.acceptedAt!)}). Hvala!
            </p>
          ) : expired ? (
            <p className="font-mono text-sm text-[#FF3B3B]">&gt; Ponudba je potekla — pišite na david@inzenirji.si za novo.</p>
          ) : owner ? (
            <p className="font-mono text-xs text-[#888]">&gt; Gumb za potrditev vidi samo stranka.</p>
          ) : (
            <AcceptForm token={p.token} />
          )}
        </section>

        <footer className="font-mono text-[10px] text-[#888]">
          David Tacer · inženirji.si · david@inzenirji.si{st.ownerPhone ? ` · ${st.ownerPhone}` : ""}
        </footer>
      </div>
    </main>
  );
}
