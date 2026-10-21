import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ScoreBadge } from "@/components/ScoreBadge";
import { GROUP_HELP, GROUP_LABEL, SOURCE_LABEL, STAGE_LABEL } from "@/lib/labels";
import { websiteKind } from "@/server/contact/website";
import { getDb } from "@/server/db/client";
import type { Issue, SiteFacts } from "@/server/research/analyze";
import { companyDetail, type GoogleProfileData } from "@/server/research/run";
import { conversation } from "@/server/mailbox/process";
import { SalesPanel } from "@/components/SalesPanel";
import { proposalsOfCompany } from "@/server/proposals/proposals";
import { HistoryButton } from "../../odgovori/history-button";
import { callNotesHistory, type Brief, type CallSummary } from "@/server/calls/calls";
import { REPLY_LABEL } from "@/lib/replyLabels";
import type { DirectoryResult } from "@/server/directories/bizi";
import type { ScorePart } from "@/server/scoring/score";
import { AddCandidateEmail, CompanyOutreach } from "../../osnutki/forms";
import { ResearchOneButton } from "../buttons";
import { demoNotes } from "@/server/demo/demo";
import { latestJob } from "@/server/jobs";
import { groupSources, latestOverview, linkKind, mentioned } from "@/server/research/overview";
import { geminiStatus } from "@/server/google/gemini";
import { isAggregatorDomain } from "@/server/contact/emails";
import { domainOf } from "@/server/contact/normalize";
import { AddLink, ChannelToggle, ContactEmail, EditCompany, OverviewButton, PasteLink, SetWebsite, TestToggle } from "../overview";
import { jobView } from "@/lib/jobs";
import { formatLj } from "@/lib/time";

export const dynamic = "force-dynamic";

const LINK_KIND: Record<string, string> = {
  website: "Stran",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  directory: "Imenik",
  booking: "Rezervacije",
  email: "E-naslov?",
  other: "Drugo",
};
const SOURCE_NAME: Record<string, string> = { google: "Google", site: "njihova stran", web_search: "splet", directory: "imenik (bizi.si / OZS)", owner: "ti" };

const SEV: Record<Issue["severity"], string> = { high: "text-danger-text", medium: "text-[#F0B429]", low: "text-text-secondary" };

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-surface">
      <h2 className="border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{`// ${title}`}</h2>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-4 border-b border-border py-2 last:border-b-0">
      <dt className="w-36 shrink-0 font-mono text-[10px] uppercase tracking-widest text-text-secondary">{k}</dt>
      <dd className="min-w-0 break-words font-sans text-sm text-text-primary">{v ?? "—"}</dd>
    </div>
  );
}

const ext = (href: string, label?: string) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
    {label ?? href} ↗
  </a>
);

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ obstaja?: string }> }) {
  const { id } = await params;
  const { obstaja } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await companyDetail(getDb(), id);
  if (!d) notFound();
  const c = d.company;
  const demo = await demoNotes(getDb(), c.id);
  const job = await latestJob(getDb(), ["research_one"], c.id);
  const [overview, overviewJob, gemini] = await Promise.all([latestOverview(getDb(), c.id), latestJob(getDb(), ["google_overview"], c.id), geminiStatus(getDb())]);
  const found = overview ? mentioned(overview.text) : { emails: [], urls: [] };
  const audit = d.audit;
  const issues = (audit?.issues ?? []) as Issue[];
  const data = (audit?.data ?? {}) as {
    facts?: SiteFacts | null;
    page?: { ms: number; https: boolean; finalUrl: string } | null;
    fetchError?: string | null;
    scanned?: { url: string; status: number }[];
    google?: GoogleProfileData | null;
    directory?: DirectoryResult | null;
    siteState?: "live" | "under_construction" | "parked" | null;
    web?: {
      summary: string | null;
      legalName: string | null;
      searches: number;
      website: string | null;
      ok: boolean;
      by?: "api" | "agent";
      error?: string | null;
      websiteState?: "live" | "under_construction" | "parked" | null;
      websiteFrom?: string | null;
      profiles?: { kind: string; url: string; handle: string | null; followers: number | null; bio: string | null; website: string | null }[];
      otherSites?: { url: string; note: string | null; state: string | null }[];
      entities?: { name: string; address: string | null; taxId: string | null; source: string | null }[];
      people?: { name: string; role: string | null }[];
      services?: string[];
      facts?: string[];
      phones?: string[];
    } | null;
  };
  const google = data.google ?? null;
  const talk = await conversation(getDb(), c.id);
  const notes = await callNotesHistory(getDb(), c.id);
  const props_ = await proposalsOfCompany(getDb(), c.id);
  const facts = data.facts ?? null;
  const kind = websiteKind(c.websiteDomain);

  return (
    <>
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
        <Link href="/podjetja" className="hover:text-accent">
          ← Podjetja
        </Link>
      </p>
      {obstaja ? (
        <p className="mb-4 border border-[#F0B429]/60 p-3 font-mono text-xs text-[#F0B429]">&gt; To podjetje je že v bazi — odprl sem obstoječe. Morebitni novi e-naslov je dodan.</p>
      ) : null}
      <PageHeader
        title={c.name}
        description={[c.category, c.city].filter(Boolean).join(" · ")}
        right={<ResearchOneButton id={c.id} again={!!audit} job={jobView(job)} />}
      />

      {c.isTest ? <p className="mb-4 border border-border p-3 font-mono text-xs text-text-secondary">&gt; Testno podjetje: ostane v CRM, a ne šteje v poročila.</p> : null}
      {audit ? (
        <div className="mb-6 border border-accent/40 bg-surface2 p-5">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-accent">
            {c.group ? GROUP_LABEL[c.group] : "—"} · raziskano {new Date(audit.createdAt).toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana" })}
          </p>
          <p className="font-sans text-sm text-text-primary">{audit.summary}</p>
          {c.group ? <p className="mt-2 font-sans text-xs text-text-secondary">{GROUP_HELP[c.group]}</p> : null}
        </div>
      ) : (
        <p className="mb-6 border border-border bg-surface p-5 font-mono text-xs text-text-secondary">&gt; Podjetje še ni raziskano.</p>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {c.scoreParts ? (
          <Box title="Točke leada">
            <div className="mb-4 flex items-center gap-3">
              <ScoreBadge score={c.score} />
              <span className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">od 100 · višje = prej kontaktiraj</span>
            </div>
            <dl>
              {(c.scoreParts as ScorePart[]).map((p) => (
                <Row
                  key={p.key}
                  k={`${p.label} ${p.points}/${p.max}`}
                  v={<span className="text-text-secondary">{p.reason}</span>}
                />
              ))}
            </dl>
          </Box>
        ) : null}
        {d.deal && d.stage ? (
          <Box title="Prodaja">
            <SalesPanel
              companyId={c.id}
              stage={d.stage}
              callAt={d.deal.callAt}
              brief={(d.deal.brief as Brief | null) ?? null}
              briefAt={d.deal.briefAt}
              summary={(d.deal.callSummary as CallSummary | null) ?? null}
              history={notes.map((n) => ({ at: n.at, notes: String((n.payload as { notes?: string }).notes ?? "") }))}
              proposals={props_.map((p) => ({ id: p.id, status: p.status, viewCount: p.viewCount, title: p.title }))}
            />
          </Box>
        ) : null}
        <Box title={`Pogovor (${talk.length})`}>
          {talk.length ? (
            <ol className="mb-5 flex flex-col gap-4">
              {talk.map((t, i) => (
                <li key={i} className={`border-l-2 pl-3 ${t.dir === "in" ? "border-accent" : "border-border"}`}>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                    {t.dir === "in" ? `← prejeto · ${REPLY_LABEL[t.label] ?? t.label}` : t.via === "crm" ? "→ poslano iz CRM" : "→ poslal ročno"} ·{" "}
                    {t.at.toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana", dateStyle: "short", timeStyle: "short" })}
                    {t.who ? <span className="normal-case tracking-normal"> · {t.who}</span> : null}
                  </p>
                  <p className="font-sans text-sm text-text-primary">{t.subject}</p>
                  <details>
                    <summary className="cursor-pointer list-none font-sans text-xs text-text-secondary">
                      <span className="line-clamp-2 whitespace-pre-wrap">{t.text}</span>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-accent">celotno besedilo ↓</span>
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-text-primary">{t.text}</pre>
                  </details>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mb-4 font-mono text-xs text-text-secondary">&gt; Še ni e-mailov s tem podjetjem v CRM.</p>
          )}
          <HistoryButton companyId={c.id} />
        </Box>
        {demo.length ? (
          <Box title="Demo urejevalnika">
            {demo.map((n) => (
              <div key={n.at.toISOString()} className="mb-3 last:mb-0">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                  {formatLj(n.at)}
                  {n.website ? ` · ${n.website}` : ""}
                </p>
                {n.edits.length ? (
                  <ul className="flex flex-col gap-1 font-sans text-sm text-text-primary">
                    {n.edits.map((e) => (
                      <li key={`${e.at}${e.request}`}>
                        <span className={e.changed ? "text-accent" : "text-text-secondary"}>{e.changed ? "✓" : "·"}</span> {e.request}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-mono text-xs text-text-secondary">&gt; E-naslov vpisan brez sprememb.</p>
                )}
              </div>
            ))}
          </Box>
        ) : null}
        <Box title="Stik in e-mail">
          <CompanyOutreach companyId={c.id} stage={d.stage} hasEmail={d.contacts.some((p) => !!p.email && !p.invalidAt)} />
        </Box>
        {google ? (
          <Box title="Google profil">
            {google.summary ? <p className="mb-4 font-sans text-sm text-text-primary">{google.summary}</p> : null}
            {google.hoursText.length ? (
              <div className="mb-4">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-text-secondary">Delovni čas na Googlu</p>
                <ul className="font-mono text-xs text-text-secondary">
                  {google.hoursText.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {google.reviews.length ? (
              <div className="flex flex-col gap-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">Zadnja mnenja</p>
                {google.reviews.map((r, i) => (
                  <blockquote key={i} className="border-l-2 border-accent/50 pl-3 font-sans text-xs text-text-secondary">
                    <span className="font-mono text-accent">{r.rating ? "★".repeat(Math.round(r.rating)) : ""}</span>{" "}
                    {r.text}
                    {r.when ? <span className="font-mono text-[10px]"> · {r.when}</span> : null}
                  </blockquote>
                ))}
              </div>
            ) : null}
            {google.mapsUrl ? <p className="mt-4 font-mono text-xs">{ext(google.mapsUrl, "Odpri na Google Maps")}</p> : null}
          </Box>
        ) : null}
        <Box title="Podatki">
          <dl>
            <Row k="Ocena" v={c.ratingX10 !== null ? `${(c.ratingX10 / 10).toFixed(1).replace(".", ",")} (${c.reviewCount ?? 0} ocen)` : null} />
            <Row k="Telefon" v={c.phone} />
            <Row k="Naslov" v={c.address} />
            <Row k="Faza" v={d.stage ? STAGE_LABEL[d.stage] : null} />
            <Row k="Vir" v={d.source ? SOURCE_LABEL[d.source] : null} />
            <Row k="Kanal" v={<ChannelToggle companyId={c.id} call={d.deal?.channel === "call"} />} />
            <Row k="Testno" v={<TestToggle companyId={c.id} isTest={c.isTest} />} />
          </dl>
          <div className="mt-4 border-t border-border pt-4">
            <EditCompany companyId={c.id} details={{ name: c.name, phone: c.phone, address: c.address, city: c.city, website: c.website, category: c.category }} />
          </div>
        </Box>

        <Box title="Google pregled (Gemini)">
          <div className="mb-4">
            <OverviewButton id={c.id} job={jobView(overviewJob)} has={!!overview} configured={gemini.set} />
          </div>
          {overview ? (
            <>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                {formatLj(new Date(overview.at))} · {overview.model}
              </p>
              <div className="mb-4 whitespace-pre-wrap font-sans text-sm text-text-primary">{overview.text}</div>
              {overview.searchHtml ? (
                <iframe
                  title="Google predlogi iskanja"
                  srcDoc={overview.searchHtml}
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  className="mb-4 h-[72px] w-full border-0 bg-transparent"
                />
              ) : null}
              {overview.sources?.length ? (
                <div className="mb-4 border-t border-border pt-3">
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">Viri, ki jih je našel Google (te povezave delujejo)</p>
                  <ul className="flex flex-col gap-1">
                    {groupSources(overview.sources).map((g) => (
                      <li key={g.title} className="flex flex-wrap items-baseline gap-x-2 font-sans text-sm">
                        <a href={g.uris[0]} target="_blank" rel="noopener noreferrer" className="text-text-primary underline decoration-border underline-offset-4 hover:text-accent">
                          {g.title} ↗
                        </a>
                        {g.uris.length > 1 ? (
                          <span className="font-mono text-[10px] text-text-secondary">
                            še:{" "}
                            {g.uris.slice(1).map((u, i) => (
                              <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="mr-1 underline underline-offset-2 hover:text-accent">
                                {i + 2}
                              </a>
                            ))}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 mb-2 font-sans text-xs text-text-secondary">Odpri vir, preveri, da je pravo podjetje, kopiraj naslov iz brskalnika in ga prilepi sem:</p>
                  <PasteLink companyId={c.id} />
                </div>
              ) : null}
              {found.emails.length || found.urls.length ? (
                <div className="border-t border-border pt-3">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-text-secondary">Shrani v CRM (samo kar je pravilno)</p>
                  {found.urls.length ? <p className="mb-2 font-sans text-xs text-[#F0B429]">Povezave v besedilu je napisal Gemini in so lahko napačne. Najprej jo odpri; shrani jo samo, če se odpre prava stran.</p> : null}
                  <ul className="flex flex-col gap-2">
                    {found.emails.map((e) => (
                      <li key={e} className="flex flex-wrap items-center gap-3 font-sans text-sm">
                        <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-widest text-text-secondary">E-naslov</span>
                        <span className="text-text-primary">{e}</span>
                        {d.contacts.some((p) => p.email === e) ? <span className="font-mono text-[10px] text-accent">✓ med kontakti</span> : <AddCandidateEmail companyId={c.id} email={e} source="Google pregled (Gemini), potrdil lastnik" />}
                      </li>
                    ))}
                    {found.urls.map((u) => {
                      const k = linkKind(u);
                      const known = d.links.some((l) => l.url === u);
                      return (
                        <li key={u} className="flex flex-wrap items-center gap-3 font-sans text-sm">
                          <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-widest text-text-secondary">{LINK_KIND[k] ?? k}</span>
                          <span className="min-w-0 break-all">{ext(u, u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60))}</span>
                          {known ? <span className="font-mono text-[10px] text-accent">✓ shranjeno</span> : <AddLink companyId={c.id} url={u} kind={k} />}
                          {k === "other" && c.website !== u ? <SetWebsite companyId={c.id} url={u} /> : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="font-mono text-xs text-text-secondary">&gt; Gemini poišče podjetje na Googlu. Pokaže, kar najde, ti pa z enim klikom shraniš, kar je pravilno.</p>
          )}
        </Box>

        {d.links.length || data.web ? (
          <Box title="Na spletu">
            {data.web && !data.web.ok ? (
              <p className="mb-3 font-mono text-xs text-danger-text">&gt; Iskanje po spletu ni uspelo: {data.web.error ?? "neznan razlog"} Poskusi »Raziskuj znova«.</p>
            ) : null}
            {data.web?.by === "agent" ? <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-accent">Nočna raziskava (Claude)</p> : null}
            {data.web?.summary ? <p className="mb-4 font-sans text-sm text-text-primary">{data.web.summary}</p> : null}
            {data.web?.website ? (
              <p className="mb-3 flex flex-wrap items-baseline gap-x-3 font-sans text-sm">
                <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-widest text-text-secondary">Domena</span>
                {ext(data.web.website, data.web.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}
                {data.web.websiteState === "under_construction" ? <span className="font-mono text-[10px] uppercase tracking-widest text-[#F0B429]">v izdelavi</span> : null}
                {data.web.websiteState === "parked" ? <span className="font-mono text-[10px] uppercase tracking-widest text-[#F0B429]">parkirana</span> : null}
                {data.web.websiteFrom ? <span className="font-mono text-[10px] text-text-secondary">vir: {data.web.websiteFrom}</span> : null}
              </p>
            ) : null}
            {(data.web?.profiles ?? []).map((p) => (
              <div key={p.url} className="mb-3">
                <p className="flex flex-wrap items-baseline gap-x-3 font-sans text-sm">
                  <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-widest text-text-secondary">{LINK_KIND[p.kind] ?? p.kind}</span>
                  {ext(p.url, p.handle ? `@${p.handle.replace(/^@/, "")}` : p.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 50))}
                  {p.followers ? <span className="font-mono text-[10px] text-text-secondary">{String(p.followers).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} sledilcev</span> : null}
                </p>
                {p.bio ? <p className="ml-[108px] font-sans text-xs text-text-secondary">{p.bio}</p> : null}
              </div>
            ))}
            {(data.web?.otherSites ?? []).map((o) => (
              <p key={o.url} className="mb-3 flex flex-wrap items-baseline gap-x-3 font-sans text-sm">
                <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-widest text-text-secondary">Druga stran</span>
                {ext(o.url, o.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60))}
                {o.note ? <span className="font-mono text-[10px] text-text-secondary">{o.note}</span> : null}
              </p>
            ))}
            {(data.web?.entities ?? []).map((e) => (
              <p key={e.name} className="mb-3 flex flex-wrap items-baseline gap-x-3 font-sans text-sm">
                <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-widest text-text-secondary">Pravna oseba</span>
                <span className="text-text-primary">{e.name}</span>
                <span className="font-mono text-[10px] text-text-secondary">{[e.address, e.taxId ? `DŠ ${e.taxId}` : null].filter(Boolean).join(" · ")}</span>
              </p>
            ))}
            {data.web?.people?.length ? (
              <p className="mb-3 flex flex-wrap items-baseline gap-x-3 font-sans text-sm">
                <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-widest text-text-secondary">Osebe</span>
                <span className="text-text-primary">{data.web.people.map((p) => (p.role ? `${p.name} (${p.role})` : p.name)).join(", ")}</span>
              </p>
            ) : null}
            {data.web?.services?.length ? (
              <p className="mb-3 flex flex-wrap items-baseline gap-x-3 font-sans text-sm">
                <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-widest text-text-secondary">Storitve</span>
                <span className="text-text-secondary">{data.web.services.join(" · ")}</span>
              </p>
            ) : null}
            {data.web?.facts?.length ? (
              <div className="mb-4">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-text-secondary">Za osebni e-mail</p>
                <ul className="ml-4 list-disc font-sans text-sm text-text-primary">
                  {data.web.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {d.links.length ? <p className="mb-2 mt-2 font-mono text-[10px] uppercase tracking-widest text-text-secondary">Vse povezave in e-naslovi</p> : null}
            <ul className="flex flex-col gap-2">
              {d.links
                .filter((l) => l.kind !== "email" || !isAggregatorDomain(domainOf(l.url.replace(/^mailto:/, ""))))
                .map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border pb-2 last:border-b-0">
                  <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-widest text-text-secondary">{LINK_KIND[l.kind] ?? l.kind}</span>
                  {l.kind === "email" ? (
                    <>
                      <span className="font-sans text-sm text-text-primary">{l.url.replace(/^mailto:/, "")}</span>
                      {l.note ? <span className="font-mono text-[10px] text-text-secondary">vir: {l.note.replace(/^https?:\/\/(www\.)?/, "").slice(0, 50)}</span> : null}
                      {d.contacts.some((p) => `mailto:${p.email}` === l.url && p.invalidAt) ? (
                        <span className="font-mono text-xs text-danger-text">označen kot napačen</span>
                      ) : d.contacts.some((p) => `mailto:${p.email}` === l.url) ? (
                        <span className="font-mono text-xs text-accent">✓ med kontakti</span>
                      ) : (
                        <AddCandidateEmail companyId={c.id} email={l.url.replace(/^mailto:/, "")} source={l.note ?? ""} />
                      )}
                    </>
                  ) : (
                    <span className="min-w-0 break-all font-sans text-sm">{ext(l.url, l.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 70))}</span>
                  )}
                  <span className={`ml-auto font-mono text-[10px] ${l.verified ? "text-accent" : "text-text-secondary"}`}>
                    {SOURCE_NAME[l.source] ?? l.source}
                    {l.kind !== "email" ? (l.verified ? " · preverjeno" : " · ni preverjeno") : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Box>
        ) : null}
        <Box title="Povezave">
          <dl>
            <Row
              k={kind === "own" ? "Spletna stran" : kind === "none" ? "Spletna stran" : "Namesto strani"}
              v={c.website ? ext(c.website, c.websiteDomain ?? undefined) : <span className="text-danger-text">nima</span>}
            />
            {Object.entries(facts?.socials ?? {}).map(([k, href]) => (
              <Row key={k} k={k} v={ext(href, href.replace(/^https?:\/\/(www\.)?/, ""))} />
            ))}
            {data.directory ? (
              <Row
                k={data.directory.source === "ozs" ? "Katalog OZS" : "Imenik bizi.si"}
                v={
                  data.directory.match ? (
                    <span>
                      {ext(data.directory.match.url, data.directory.match.legalName)}
                      <span className="block font-mono text-[10px] text-text-secondary">
                        ujemanje:{" "}
                        {data.directory.source === "ozs"
                          ? ({ phone: "telefon", name: "ime in kraj", only: "naslov" } as const)[data.directory.match.by]
                          : `naslov${data.directory.match.by === "name" ? " + ime" : data.directory.match.by === "phone" ? " + telefon" : ""}`}{" "}
                        ·{" "}
                        {data.directory.emails.length ? `e-naslov: ${data.directory.emails.join(", ")}` : "e-naslova ni objavljenega"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-text-secondary">
                      {data.directory.source === "ozs"
                        ? data.directory.candidates
                          ? `${data.directory.candidates} zadetkov v katalogu, nobeden zanesljivo ne ustreza`
                          : "ni v katalogu"
                        : data.directory.candidates
                          ? `${data.directory.candidates} podjetij na naslovu, nobeno zanesljivo`
                          : "ni najdeno"} · {ext(data.directory.searchUrl, "iskanje")}
                    </span>
                  )
                }
              />
            ) : null}
            {data.scanned?.length ? (
              <Row
                k="Pregledane strani"
                v={
                  <span className="flex flex-col gap-1 font-mono text-xs">
                    {data.scanned.map((p) => (
                      <span key={p.url} className={p.status && p.status < 400 ? "" : "text-danger-text"}>
                        {p.url.replace(/^https?:\/\/(www\.)?/, "")}
                        {p.status && p.status < 400 ? "" : " (ni odprlo)"}
                      </span>
                    ))}
                  </span>
                }
              />
            ) : null}
            {c.placeId ? <Row k="Google Maps" v={ext(`https://www.google.com/maps/place/?q=place_id:${c.placeId}`, "odpri")} /> : null}
          </dl>
        </Box>

        <Box title="Težave na strani">
          {issues.length === 0 ? (
            <p className="font-mono text-xs text-text-secondary">{audit ? "Večjih težav nismo našli." : "Najprej zaženi raziskavo."}</p>
          ) : (
            <ul className="space-y-2">
              {issues.map((i) => (
                <li key={i.code} className="flex gap-3 font-sans text-sm">
                  <span className={`mt-0.5 font-mono text-[10px] uppercase ${SEV[i.severity]}`}>{i.severity === "high" ? "■■■" : i.severity === "medium" ? "■■□" : "■□□"}</span>
                  <span className="text-text-primary">{i.text}</span>
                </li>
              ))}
            </ul>
          )}
          {facts ? (
            <dl className="mt-4 border-t border-border pt-3">
              <Row k="CMS" v={facts.cms ? `${facts.cms}${facts.cmsVersion ? ` ${facts.cmsVersion}` : ""}` : "ni zaznan"} />
              <Row k="Letnica" v={facts.copyrightYear} />
              <Row k="Telefon prilagojen" v={facts.hasViewport ? "da" : "ne"} />
              <Row k="Nalaganje" v={data.page ? `${(data.page.ms / 1000).toFixed(1).replace(".", ",")} s${data.page.https ? "" : " · brez HTTPS"}` : null} />
              <Row k="Naslov strani" v={facts.title} />
            </dl>
          ) : data.fetchError ? (
            <p className="mt-3 font-mono text-[10px] text-text-secondary">Napaka pri odpiranju: {data.fetchError}</p>
          ) : null}
        </Box>

        <Box title="E-naslovi (objavljeni)">
          {d.contacts.length === 0 ? (
            <p className="font-mono text-xs text-text-secondary">Ni najdenih e-naslovov.</p>
          ) : (
            <ul className="space-y-2">
              {d.contacts
                .filter((p) => !!p.email)
                .map((p) => (
                  <ContactEmail key={p.id} companyId={c.id} email={p.email!} source={p.emailSource} invalidReason={p.invalidAt ? (p.invalidReason ?? "napačen") : null} />
                ))}
            </ul>
          )}
        </Box>

        <Box title={(audit?.data as { competitorSource?: string } | undefined)?.competitorSource === "nearby" ? "Konkurenti v okolici (Google)" : "Konkurenti (isti kraj in panoga, iz baze)"}>
          {d.competitors.length === 0 ? (
            <p className="font-mono text-xs text-text-secondary">Ni konkurentov v bazi. Poišči več podjetij iste panoge v tem kraju.</p>
          ) : (
            <ul className="space-y-2">
              {d.competitors.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3 border-b border-border pb-2 last:border-b-0">
                  <Link href={`/podjetja/${r.id}`} className="font-sans text-sm text-text-primary hover:text-accent">
                    {r.name}
                  </Link>
                  <span className="font-mono text-[10px] text-text-secondary">
                    {r.distanceM !== null ? `${r.distanceM < 1000 ? `${r.distanceM} m` : `${(r.distanceM / 1000).toFixed(1).replace(".", ",")} km`} · ` : ""}
                    {r.ratingX10 !== null ? `${(r.ratingX10 / 10).toFixed(1).replace(".", ",")} (${r.reviewCount ?? 0})` : ""} ·{" "}
                    {websiteKind(r.websiteDomain) === "own" ? r.websiteDomain : <span className="text-danger-text">brez strani</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Box>
      </div>
    </>
  );
}
