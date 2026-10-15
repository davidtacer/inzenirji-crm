import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { GROUP_HELP, GROUP_LABEL, SOURCE_LABEL, STAGE_LABEL } from "@/lib/labels";
import { websiteKind } from "@/server/contact/website";
import { getDb } from "@/server/db/client";
import type { Issue, SiteFacts } from "@/server/research/analyze";
import { companyDetail } from "@/server/research/run";
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

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await companyDetail(getDb(), id);
  if (!d) notFound();
  const c = d.company;
  const audit = d.audit;
  const issues = (audit?.issues ?? []) as Issue[];
  const data = (audit?.data ?? {}) as { facts?: SiteFacts | null; page?: { ms: number; https: boolean; finalUrl: string } | null; fetchError?: string | null };
  const facts = data.facts ?? null;
  const kind = websiteKind(c.websiteDomain);

  return (
    <>
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-text-secondary">
        <Link href="/podjetja" className="hover:text-accent">
          ← Podjetja
        </Link>
      </p>
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
