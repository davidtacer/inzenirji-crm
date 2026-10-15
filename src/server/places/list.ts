import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { companies, deals } from "../db/schema";
import { NOT_OWN_WEBSITE_DOMAINS } from "../contact/website";

export async function latestCompanies(db: Db, limit = 50) {
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
      updatedAt: companies.updatedAt,
    })
    .from(companies)
    .leftJoin(deals, eq(deals.companyId, companies.id))
    .orderBy(desc(companies.updatedAt))
    .limit(limit);
}

export async function companyCounts(db: Db) {
  const [r] = await db
    .select({
      total: sql<number>`count(*)::int`,
      good: sql<number>`count(*) filter (where ${companies.ratingX10} >= 43 and ${companies.reviewCount} >= 30)::int`,
      noWebsite: sql<number>`count(*) filter (where ${companies.websiteDomain} is null or ${companies.websiteDomain} in (${sql.join(
        NOT_OWN_WEBSITE_DOMAINS.map((d) => sql`${d}`),
        sql`, `,
      )}) or ${companies.websiteDomain} like '%.facebook.com')::int`,
    })
    .from(companies);
  return r;
}
