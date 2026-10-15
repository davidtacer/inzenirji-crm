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
import { safeFetch, type FetchedPage, type Resolver } from "./safe-fetch";
import { findNearbyCompetitors, type Competitor, type PlacesDeps } from "./competitors";
import { isGoodBusiness } from "../places/import";
import { rescoreCompany } from "../scoring/apply";

/** `places`: when set, good businesses get their Google profile and real nearby competitors (TASK-022/023). */
export type AuditDeps = { fetchImpl?: typeof fetch; resolve?: Resolver; now?: Date; places?: PlacesDeps };

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
        /** 2 = deep research (TASK-023). */
        v: 2,
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
  return { group, issues: issues.length, emails: facts?.emails.length ?? 0, competitors: competitors!.length, competitorSource, siteDomain, score: score?.total ?? null };
}

/** Researched companies whose latest audit is from before deep research (TASK-023). */
const shallow = sql`not exists (select 1 from ${audits} a where a.company_id = ${companies.id} and (a.data->>'v')::int >= 2)`;

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
    .select({ company: companies, stage: deals.stage, source: deals.source })
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

export async function listCompanies(db: Db, filter: CompanyFilter, limit = 200) {
  const where =
    filter === "good"
      ? and(sql`${companies.ratingX10} >= 43`, sql`${companies.reviewCount} >= 30`)
      : filter === "A" || filter === "B"
        ? eq(companies.group, filter)
        : filter === "found" || filter === "researched"
          ? eq(deals.stage, filter)
          : undefined;
  return db
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
    .where(where)
    .orderBy(sql`${companies.score} desc nulls last`, desc(companies.updatedAt))
    .limit(limit);
}

export async function unresearchedCount(db: Db) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(deals).where(and(eq(deals.stage, "found"), isNotNull(deals.companyId)));
  return r.n;
}
