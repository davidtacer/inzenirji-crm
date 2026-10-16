import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { domainOf, normalizeEmail } from "../contact/normalize";
import { websiteKind } from "../contact/website";
import type { Db } from "../db/client";
import { audits, companies, competitorLinks, contacts, deals } from "../db/schema";
import { analyzeHtml, contactLinks, findIssues, pageText, proposeGroup, rankEmails, summarize, type SiteFacts } from "./analyze";
import { googleHours, hoursMismatch, parseSiteHours } from "./hours";
import { PlacesError, placeProfile, type PlaceProfile, type PlaceReview } from "../places/client";
import { QuotaError, reserveCall } from "../places/quota";
import { PLACES_PROVIDER } from "../places/search";
import { lookupBizi, type DirectoryResult } from "../directories/bizi";
import { safeFetch, type FetchedPage, type Resolver } from "./safe-fetch";
import { findNearbyCompetitors, type Competitor, type PlacesDeps } from "./competitors";
import { isGoodBusiness } from "../places/import";
import { rescoreCompany } from "../scoring/apply";

/** `places`: when set, good businesses get their Google profile and real nearby competitors (TASK-022/023). */
export type AuditDeps = {
  fetchImpl?: typeof fetch;
  resolve?: Resolver;
  now?: Date;
  places?: PlacesDeps;
  /** Look up e-mails in public directories when the site has none (TASK-025). */
  directories?: boolean;
};

/** Audit format: 2 = deep research (TASK-023), 3 = + directories (TASK-025). Older audits can be re-run. */
export const AUDIT_VERSION = 3;

export type GoogleProfileData = {
  businessStatus: string | null;
  summary: string | null;
  mapsUrl: string | null;
  hoursText: string[];
  reviews: PlaceReview[];
};

/**
 * Researches one company (TASK-006, deepened in TASK-023): homepage + up to 4 contact/about/imprint pages,
 * every published e-mail with the page it was found on, opening hours on the site vs. Google, Google profile
 * (status, description, reviews) for good businesses, issues, group A/B, competitors, stage found → researched.
 */
export async function runAudit(db: Db, companyId: string, deps: AuditDeps = {}) {
  let [c] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!c) throw new Error("COMPANY_NOT_FOUND");
  const kind = websiteKind(c.websiteDomain);
  let page: FetchedPage | null = null;
  let facts: SiteFacts | null = null;
  let fetchError: string | null = null;
  const emailSource = new Map<string, string>();
  const scanned: { url: string; status: number }[] = [];
  let siteText = "";
  if (kind === "own" && c.website) {
    try {
      page = await safeFetch(/^https?:\/\//i.test(c.website) ? c.website : `https://${c.website}`, deps);
      scanned.push({ url: page.finalUrl, status: page.status });
      if (page.status < 400) {
        facts = analyzeHtml(page.html);
        for (const e of facts.emails) emailSource.set(e, page.finalUrl);
        siteText = pageText(page.html);
        const phones = new Set(facts.phones);
        for (const link of contactLinks(page.html, page.finalUrl, 4)) {
          try {
            const sub = await safeFetch(link, { ...deps, timeoutMs: 8_000 });
            scanned.push({ url: sub.finalUrl, status: sub.status });
            if (sub.status >= 400) continue;
            const f = analyzeHtml(sub.html);
            for (const e of f.emails) if (!emailSource.has(e)) emailSource.set(e, sub.finalUrl);
            for (const p of f.phones) phones.add(p);
            for (const [k, v] of Object.entries(f.socials)) facts.socials[k] ??= v;
            siteText += `\n${pageText(sub.html)}`;
          } catch {
            scanned.push({ url: link, status: 0 });
          }
        }
        facts.phones = [...phones];
        facts.emails = rankEmails([...emailSource.keys()], domainOf(page.finalUrl));
      }
    } catch (e) {
      fetchError = e instanceof Error ? e.message : "FETCH_FAILED";
    }
  }

  // Google profile for good businesses (one Place Details call within the daily cap).
  let google: PlaceProfile | null = null;
  if (deps.places?.apiKey && c.placeId && isGoodBusiness(c)) {
    try {
      await reserveCall(db, PLACES_PROVIDER, deps.places.dailyCap);
      google = await placeProfile(c.placeId, deps.places.apiKey, deps.places.fetchImpl);
      if ((c.lat === null || c.lng === null || !c.placeType) && google.lat !== null && google.lng !== null) {
        [c] = await db
          .update(companies)
          .set({ lat: google.lat, lng: google.lng, placeType: c.placeType ?? google.type })
          .where(eq(companies.id, c.id))
          .returning();
      }
    } catch (e) {
      if (!(e instanceof QuotaError || e instanceof PlacesError)) throw e;
    }
  }

  // Public directory when the company's own pages publish no e-mail (TASK-025, ADR-022).
  let directory: DirectoryResult | null = null;
  if (deps.directories && emailSource.size === 0) {
    try {
      directory = await lookupBizi(c, deps);
    } catch (e) {
      directory = null;
      console.error("[research] directory lookup failed:", e instanceof Error ? e.message : "unknown");
    }
  }

  const reachable = !!facts;
  const nowYear = (deps.now ?? new Date()).getFullYear();
  const siteHours = siteText ? parseSiteHours(siteText) : null;
  const issues = findIssues(facts, {
    kind,
    https: page?.https,
    ms: page?.ms,
    status: page ? page.status : kind === "own" ? 599 : undefined,
    googlePhoneDigits: c.phone?.replace(/\D/g, ""),
    nowYear,
    hoursMismatch: hoursMismatch(siteHours, googleHours(google?.periods)),
    closedPermanently: google?.businessStatus === "CLOSED_PERMANENTLY",
  });
  const group = proposeGroup(kind, reachable);
  const summary = summarize(issues, group);
  const googleData: GoogleProfileData | null = google
    ? { businessStatus: google.businessStatus, summary: google.summary, mapsUrl: google.mapsUrl, hoursText: google.hoursText, reviews: google.reviews }
    : null;

  let competitors: Competitor[] | null = null;
  let competitorSource: "nearby" | "database" = "database";
  if (deps.places && isGoodBusiness(c)) {
    competitors = await findNearbyCompetitors(db, c, deps.places);
    if (competitors) competitorSource = "nearby";
  }
  if (!competitors) {
    const rows =
      c.city && c.category
        ? await db
            .select({ id: companies.id })
            .from(companies)
            .where(and(eq(companies.city, c.city), eq(companies.category, c.category), ne(companies.id, c.id)))
            .orderBy(desc(sql`coalesce(${companies.ratingX10}, 0) * least(coalesce(${companies.reviewCount}, 0), 200)`))
            .limit(5)
        : [];
    competitors = rows.map((r) => ({ id: r.id, distanceM: -1 }));
  }

  const siteDomain = domainOf(page?.finalUrl ?? c.website);
  await db.transaction(async (tx) => {
    await tx.insert(audits).values({
      companyId: c.id,
      data: {
        v: AUDIT_VERSION,
        directory,
        competitorSource,
        kind,
        page: page ? { finalUrl: page.finalUrl, status: page.status, ms: page.ms, https: page.https, redirects: page.redirects } : null,
        facts,
        fetchError,
        scanned,
        siteHours,
        google: googleData,
        // Visible text of the scanned pages, for the AI remark (TASK-024); capped.
        siteText: siteText.slice(0, 8000) || null,
      },
      issues,
      summary,
    });
    await tx.update(companies).set({ group, updatedAt: new Date() }).where(eq(companies.id, c.id));
    for (const raw of facts?.emails ?? []) {
      const email = normalizeEmail(raw);
      if (!email) continue;
      // Published by the business on its own site (ADR-007); the page is the source.
      await tx.insert(contacts).values({ companyId: c.id, email, emailSource: emailSource.get(raw) ?? page!.finalUrl }).onConflictDoNothing();
    }
    for (const raw of directory?.match ? directory.emails : []) {
      const email = normalizeEmail(raw);
      // Published in a public business directory (ADR-007); the directory page is the source.
      if (email) await tx.insert(contacts).values({ companyId: c.id, email, emailSource: directory!.match!.url }).onConflictDoNothing();
    }
    if (competitorSource === "nearby") await tx.delete(competitorLinks).where(eq(competitorLinks.companyId, c.id));
    for (const comp of competitors!) {
      await tx
        .insert(competitorLinks)
        .values({ companyId: c.id, competitorId: comp.id, distanceM: comp.distanceM >= 0 ? comp.distanceM : null })
        .onConflictDoNothing();
    }
    await tx.update(deals).set({ stage: "researched", updatedAt: new Date() }).where(and(eq(deals.companyId, c.id), eq(deals.stage, "found")));
  });
  const score = await rescoreCompany(db, c.id);
  return { group, issues: issues.length, emails: (facts?.emails.length ?? 0) + (directory?.match ? directory.emails.length : 0), directoryEmails: directory?.match ? directory.emails.length : 0, competitors: competitors!.length, competitorSource, siteDomain, score: score?.total ?? null };
}

/** Researched companies whose latest audit is from before deep research (TASK-023). */
const shallow = sql`not exists (select 1 from ${audits} a where a.company_id = ${companies.id} and (a.data->>'v')::int >= ${AUDIT_VERSION})`;

export async function shallowCount(db: Db): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(companies)
    .innerJoin(deals, eq(deals.companyId, companies.id))
    .where(and(eq(deals.stage, "researched"), shallow));
  return r?.n ?? 0;
}

/**
 * Researches up to `limit` not-yet-researched companies, best businesses first, `concurrency` at a time.
 * `deepen`: instead, re-researches already researched companies that only had the old homepage-only research,
 * highest score first (TASK-023).
 */
export async function researchBatch(db: Db, opts: { limit?: number; concurrency?: number; deepen?: boolean } & AuditDeps = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const rows = opts.deepen
    ? await db
        .select({ id: companies.id })
        .from(companies)
        .innerJoin(deals, eq(deals.companyId, companies.id))
        .where(and(eq(deals.stage, "researched"), shallow))
        .orderBy(sql`${companies.score} desc nulls last`)
        .limit(limit)
    : await db
        .select({ id: companies.id })
        .from(companies)
        .innerJoin(deals, eq(deals.companyId, companies.id))
        .where(eq(deals.stage, "found"))
        .orderBy(desc(sql`coalesce(${companies.ratingX10}, 0) * least(coalesce(${companies.reviewCount}, 0), 200)`))
        .limit(limit);
  const queue = rows.map((r) => r.id);
  let done = 0;
  let failed = 0;
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        await runAudit(db, id, opts);
        done++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 3, queue.length || 1) }, worker));
  return { done, failed };
}

export async function companyDetail(db: Db, id: string) {
  const [c] = await db
    .select({ company: companies, stage: deals.stage, source: deals.source, deal: deals })
    .from(companies)
    .leftJoin(deals, eq(deals.companyId, companies.id))
    .where(eq(companies.id, id))
    .limit(1);
  if (!c) return null;
  const [audit] = await db.select().from(audits).where(eq(audits.companyId, id)).orderBy(desc(audits.createdAt)).limit(1);
  const people = await db.select().from(contacts).where(eq(contacts.companyId, id));
  const links = await db
    .select({ id: competitorLinks.competitorId, distanceM: competitorLinks.distanceM })
    .from(competitorLinks)
    .where(eq(competitorLinks.companyId, id));
  const rivals = links.length
    ? await db
        .select({ id: companies.id, name: companies.name, website: companies.website, websiteDomain: companies.websiteDomain, ratingX10: companies.ratingX10, reviewCount: companies.reviewCount })
        .from(companies)
        .where(inArray(companies.id, links.map((l) => l.id)))
    : [];
  const dist = new Map(links.map((l) => [l.id, l.distanceM]));
  const withDistance = rivals
    .map((r) => ({ ...r, distanceM: dist.get(r.id) ?? null }))
    .sort((a, b) => (a.distanceM ?? 1e9) - (b.distanceM ?? 1e9) || (b.ratingX10 ?? 0) - (a.ratingX10 ?? 0));
  return { ...c, audit: audit ?? null, contacts: people, competitors: withDistance };
}

export type CompanyFilter = "all" | "good" | "A" | "B" | "found" | "researched";

/** Company list filters (TASK-030): free text, stage, group, city, contact, website, minimum score, sort. */
export type CompanyQuery = {
  q?: string;
  stage?: string;
  group?: "A" | "B";
  city?: string;
  email?: "yes" | "no";
  site?: "own" | "none";
  good?: boolean;
  minScore?: number;
  sort?: "score" | "rating" | "reviews" | "name" | "new";
  limit?: number;
};

const STAGE_VALUES = ["found", "researched", "contacted", "replied", "call_booked", "call_done", "proposal_sent", "won", "lost", "nurture"];

/** Reads the URL query into a CompanyQuery; unknown values are ignored. Old `?f=` links still work. */
export function parseCompanyQuery(p: Record<string, string | undefined>): CompanyQuery {
  const q: CompanyQuery = {};
  if (p.q?.trim()) q.q = p.q.trim().slice(0, 100);
  if (p.stage && STAGE_VALUES.includes(p.stage)) q.stage = p.stage;
  if (p.group === "A" || p.group === "B") q.group = p.group;
  if (p.city?.trim()) q.city = p.city.trim().slice(0, 60);
  if (p.email === "yes" || p.email === "no") q.email = p.email;
  if (p.site === "own" || p.site === "none") q.site = p.site;
  if (p.good === "1") q.good = true;
  const min = Number(p.min);
  if (Number.isFinite(min) && min > 0 && min <= 100) q.minScore = Math.round(min);
  if (p.sort === "rating" || p.sort === "reviews" || p.sort === "name" || p.sort === "new" || p.sort === "score") q.sort = p.sort;
  // legacy chips
  if (p.f === "good") q.good = true;
  if (p.f === "A" || p.f === "B") q.group = p.f;
  if (p.f === "found" || p.f === "researched") q.stage = p.f;
  return q;
}

const SOCIAL_OR_LINK = ["facebook.com", "instagram.com", "tiktok.com", "linktr.ee", "onelink.to", "youtube.com", "linkedin.com"];

export async function listCompanies(db: Db, query: CompanyQuery | CompanyFilter = {}, limit = 200) {
  const qy: CompanyQuery = typeof query === "string" ? parseCompanyQuery({ f: query }) : query;
  const conds = [];
  if (qy.q) {
    const like = `%${qy.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conds.push(
      sql`(${companies.name} ilike ${like} or ${companies.city} ilike ${like} or ${companies.category} ilike ${like} or ${companies.address} ilike ${like}
        or ${companies.websiteDomain} ilike ${like} or ${companies.phone} ilike ${like}
        or exists (select 1 from ${contacts} ct where ct.company_id = ${companies.id} and ct.email ilike ${like}))`,
    );
  }
  if (qy.stage) conds.push(sql`${deals.stage} = ${qy.stage}`);
  if (qy.group) conds.push(eq(companies.group, qy.group));
  if (qy.city) conds.push(sql`${companies.city} ilike ${qy.city}`);
  if (qy.good) conds.push(and(sql`${companies.ratingX10} >= 43`, sql`${companies.reviewCount} >= 30`));
  if (qy.minScore) conds.push(sql`${companies.score} >= ${qy.minScore}`);
  const hasEmail = sql`exists (select 1 from ${contacts} ct where ct.company_id = ${companies.id} and ct.email is not null)`;
  if (qy.email === "yes") conds.push(hasEmail);
  if (qy.email === "no") conds.push(sql`not ${hasEmail}`);
  const social = sql.join(SOCIAL_OR_LINK.map((d) => sql`${d}`), sql`, `);
  if (qy.site === "own") conds.push(sql`${companies.websiteDomain} is not null and ${companies.websiteDomain} not in (${social})`);
  if (qy.site === "none") conds.push(sql`(${companies.websiteDomain} is null or ${companies.websiteDomain} in (${social}))`);
  const order =
    qy.sort === "rating"
      ? [sql`${companies.ratingX10} desc nulls last`, sql`${companies.reviewCount} desc nulls last`]
      : qy.sort === "reviews"
        ? [sql`${companies.reviewCount} desc nulls last`]
        : qy.sort === "name"
          ? [sql`${companies.name} asc`]
          : qy.sort === "new"
            ? [desc(companies.createdAt)]
            : [sql`${companies.score} desc nulls last`, desc(companies.updatedAt)];
  const base = db
    .select({
      id: companies.id,
      name: companies.name,
      city: companies.city,
      category: companies.category,
      ratingX10: companies.ratingX10,
      reviewCount: companies.reviewCount,
      website: companies.website,
      websiteDomain: companies.websiteDomain,
      phone: companies.phone,
      group: companies.group,
      score: companies.score,
      stage: deals.stage,
    })
    .from(companies)
    .leftJoin(deals, eq(deals.companyId, companies.id))
    .where(conds.length ? and(...conds) : undefined);
  const [rows, [total]] = await Promise.all([
    base.orderBy(...order).limit(qy.limit ?? limit),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(companies)
      .leftJoin(deals, eq(deals.companyId, companies.id))
      .where(conds.length ? and(...conds) : undefined),
  ]);
  return Object.assign(rows, { total: total.n });
}

/** Cities in the database, most companies first (filter dropdown). */
export async function companyCities(db: Db) {
  return db
    .select({ city: companies.city, n: sql<number>`count(*)::int` })
    .from(companies)
    .where(sql`${companies.city} is not null`)
    .groupBy(companies.city)
    .orderBy(sql`count(*) desc`, companies.city)
    .limit(60);
}

export async function unresearchedCount(db: Db) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(deals).where(and(eq(deals.stage, "found"), isNotNull(deals.companyId)));
  return r.n;
}
