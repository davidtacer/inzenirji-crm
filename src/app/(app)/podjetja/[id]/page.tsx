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
import { REPLY_LABEL } from "@/lib/replyLabels";
import type { DirectoryResult } from "@/server/directories/bizi";
import type { ScorePart } from "@/server/scoring/score";
import { CompanyOutreach } from "../../osnutki/forms";
import { ResearchOneButton } from "../buttons";

export const dynamic = "force-dynamic";

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
  const audit = d.audit;
  const issues = (audit?.issues ?? []) as Issue[];
  const data = (audit?.data ?? {}) as {
    facts?: SiteFacts | null;
    page?: { ms: number; https: boolean; finalUrl: string } | null;
    fetchError?: string | null;
    scanned?: { url: string; status: number }[];
    google?: GoogleProfileData | null;
    directory?: DirectoryResult | null;
  };
  const google = data.google ?? null;
  const talk = await conversation(getDb(), c.id);
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
        right={<ResearchOneButton id={c.id} again={!!audit} />}
      />

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
        {talk.length ? (
          <Box title="Pogovor">
            <ol className="flex flex-col gap-4">
              {talk.map((t, i) => (
                <li key={i} className={`border-l-2 pl-3 ${t.dir === "in" ? "border-accent" : "border-border"}`}>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-text-secondary">
                    {t.dir === "in" ? `← prejeto · ${REPLY_LABEL[t.label] ?? t.label}` : "→ poslano"} · {t.at.toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana", dateStyle: "short", timeStyle: "short" })}
                  </p>
                  <p className="font-sans text-sm text-text-primary">{t.subject}</p>
                  <p className="line-clamp-4 whitespace-pre-wrap font-sans text-xs text-text-secondary">{t.text}</p>
                </li>
              ))}
            </ol>
          </Box>
        ) : null}
        <Box title="Stik in e-mail">
          <CompanyOutreach companyId={c.id} stage={d.stage} hasEmail={d.contacts.some((p) => !!p.email)} />
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
          </dl>
        </Box>

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
                k="Imenik bizi.si"
                v={
                  data.directory.match ? (
                    <span>
                      {ext(data.directory.match.url, data.directory.match.legalName)}
                      <span className="block font-mono text-[10px] text-text-secondary">
                        ujemanje: naslov{data.directory.match.by === "name" ? " + ime" : data.directory.match.by === "phone" ? " + telefon" : ""} ·{" "}
                        {data.directory.emails.length ? `e-naslov: ${data.directory.emails.join(", ")}` : "e-naslova ni objavljenega"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-text-secondary">
                      {data.directory.candidates ? `${data.directory.candidates} podjetij na naslovu, nobeno zanesljivo` : "ni najdeno"} · {ext(data.directory.searchUrl, "iskanje")}
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
              {d.contacts.map((p) => (
                <li key={p.id} className="font-mono text-xs">
                  <span className="text-text-primary">{p.email}</span>
                  {p.emailSource ? <span className="block text-[10px] text-text-secondary">vir: {p.emailSource}</span> : null}
                </li>
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
