import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { domainOf, normalizeEmail } from "../contact/normalize";
import { websiteKind } from "../contact/website";
import type { Db } from "../db/client";
import { audits, companies, competitorLinks, contacts, deals } from "../db/schema";
import { analyzeHtml, findIssues, proposeGroup, summarize, type SiteFacts } from "./analyze";
import { safeFetch, type FetchedPage, type Resolver } from "./safe-fetch";
import { findNearbyCompetitors, type Competitor, type PlacesDeps } from "./competitors";
import { isGoodBusiness } from "../places/import";
import { rescoreCompany } from "../scoring/apply";

/** `places`: when set, good businesses get real nearby competitors from Google (TASK-022). */
export type AuditDeps = { fetchImpl?: typeof fetch; resolve?: Resolver; now?: Date; places?: PlacesDeps };

/**
 * Researches one company (TASK-006): website checks, issues, published e-mails (with source), group A/B,
 * up to 5 competitors from our own database (same city + category), stage found → researched.
 */
export async function runAudit(db: Db, companyId: string, deps: AuditDeps = {}) {
  const [c] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!c) throw new Error("COMPANY_NOT_FOUND");
  const kind = websiteKind(c.websiteDomain);
  let page: FetchedPage | null = null;
  let facts: SiteFacts | null = null;
  let fetchError: string | null = null;
  if (kind === "own" && c.website) {
    try {
      page = await safeFetch(/^https?:\/\//i.test(c.website) ? c.website : `https://${c.website}`, deps);
      if (page.status < 400) facts = analyzeHtml(page.html);
    } catch (e) {
      fetchError = e instanceof Error ? e.message : "FETCH_FAILED";
    }
  }
  const reachable = !!facts;
  const nowYear = (deps.now ?? new Date()).getFullYear();
  const issues = findIssues(facts, {
    kind,
    https: page?.https,
    ms: page?.ms,
    status: page ? page.status : kind === "own" ? 599 : undefined,
    googlePhoneDigits: c.phone?.replace(/\D/g, ""),
    nowYear,
  });
  const group = proposeGroup(kind, reachable);
  const summary = summarize(issues, group);

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
      data: { competitorSource, kind, page: page ? { finalUrl: page.finalUrl, status: page.status, ms: page.ms, https: page.https, redirects: page.redirects } : null, facts, fetchError },
      issues,
      summary,
    });
    await tx.update(companies).set({ group, updatedAt: new Date() }).where(eq(companies.id, c.id));
    for (const raw of facts?.emails ?? []) {
      const email = normalizeEmail(raw);
      if (!email) continue;
      // Published by the business on its own site (ADR-007); the page is the source.
      await tx.insert(contacts).values({ companyId: c.id, email, emailSource: page!.finalUrl }).onConflictDoNothing();
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

/** Researches up to `limit` not-yet-researched companies, best businesses first, `concurrency` at a time. */
export async function researchBatch(db: Db, opts: { limit?: number; concurrency?: number } & AuditDeps = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const rows = await db
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
