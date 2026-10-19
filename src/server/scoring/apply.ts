import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { domainOf } from "../contact/normalize";
import { websiteKind } from "../contact/website";
import type { Db } from "../db/client";
import { audits, companies, competitorLinks, contacts, deals, doNotContact } from "../db/schema";
import type { Issue } from "../research/analyze";
import { scoreLead, type Score } from "./score";

/** True when the company, its website domain or any of its e-mails/e-mail domains is on the do-not-contact list. */
export async function companyBlocked(db: Db, companyId: string, website: string | null): Promise<boolean> {
  const emails = (await db.select({ email: contacts.email }).from(contacts).where(eq(contacts.companyId, companyId)))
    .map((r) => r.email)
    .filter((e): e is string => !!e);
  const domains = [...new Set([domainOf(website), ...emails.map((e) => domainOf(e))].filter((d): d is string => !!d))];
  const conds = [and(eq(doNotContact.kind, "company"), eq(doNotContact.value, companyId))];
  if (emails.length) conds.push(and(eq(doNotContact.kind, "email"), inArray(doNotContact.value, emails)));
  if (domains.length) conds.push(and(eq(doNotContact.kind, "domain"), inArray(doNotContact.value, domains)));
  const r = await db.select({ id: doNotContact.id }).from(doNotContact).where(or(...conds)).limit(1);
  return r.length > 0;
}

/** Recomputes and stores the score of one researched company. Returns null when it has no research yet. */
export async function rescoreCompany(db: Db, companyId: string): Promise<Score | null> {
  const [c] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!c) return null;
  const [audit] = await db.select().from(audits).where(eq(audits.companyId, companyId)).orderBy(desc(audits.createdAt)).limit(1);
  if (!audit) return null;
  const data = (audit.data ?? {}) as { facts?: unknown; google?: { businessStatus?: string | null } | null };
  const rivals = await db
    .select({ domain: companies.websiteDomain })
    .from(competitorLinks)
    .innerJoin(companies, eq(companies.id, competitorLinks.competitorId))
    .where(eq(competitorLinks.companyId, companyId));
  const [email] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.companyId, companyId), sql`${contacts.email} is not null and ${contacts.invalidAt} is null`))
    .limit(1);
  const score = scoreLead({
    ratingX10: c.ratingX10,
    reviewCount: c.reviewCount,
    kind: websiteKind(c.websiteDomain),
    reachable: !!data.facts,
    issues: (audit.issues ?? []) as Issue[],
    competitorKinds: rivals.map((r) => websiteKind(r.domain)),
    hasEmail: !!email,
    hasPhone: !!c.phone,
    doNotContact: await companyBlocked(db, c.id, c.website),
    closed: data.google?.businessStatus === "CLOSED_PERMANENTLY",
  });
  await db.update(companies).set({ score: score.total, scoreParts: score.parts }).where(eq(companies.id, c.id));
  return score;
}

/** Scores researched companies that have no score yet (e.g. researched before TASK-007). */
export async function rescoreMissing(db: Db, limit = 500): Promise<number> {
  const rows = await db
    .selectDistinct({ id: companies.id })
    .from(companies)
    .innerJoin(audits, eq(audits.companyId, companies.id))
    .where(isNull(companies.score))
    .limit(limit);
  for (const r of rows) await rescoreCompany(db, r.id);
  return rows.length;
}

/** Today's best leads: researched, not contacted yet, highest score first. */
export async function topLeads(db: Db, limit = 10) {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      city: companies.city,
      category: companies.category,
      group: companies.group,
      score: companies.score,
      website: companies.website,
      websiteDomain: companies.websiteDomain,
      hasEmail: sql<boolean>`exists (select 1 from ${contacts} where ${contacts.companyId} = ${companies.id} and ${contacts.email} is not null)`,
      hasDraft: sql<boolean>`exists (select 1 from drafts d where d.deal_id = ${deals.id} and d.status <> 'discarded')`,
      summary: sql<string | null>`(select ${audits.summary} from ${audits} where ${audits.companyId} = ${companies.id} order by ${audits.createdAt} desc limit 1)`,
    })
    .from(companies)
    .innerJoin(deals, eq(deals.companyId, companies.id))
    .where(and(eq(deals.stage, "researched"), sql`${companies.score} > 0`))
    .orderBy(desc(companies.score), desc(companies.reviewCount))
    .limit(limit);
}
