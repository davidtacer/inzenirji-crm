import { and, eq, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { doNotContact } from "../db/schema";
import { domainOf, normalizeEmail } from "./normalize";

export type DncTarget = { email: string; companyId?: string };

/**
 * True when this e-mail may not be contacted: the address, its domain, or the company is on the
 * do-not-contact list (ADR-007). An address that cannot be normalised is treated as blocked.
 * Every outbound draft and send must pass through this check.
 */
export async function isBlocked(db: Db, target: DncTarget): Promise<boolean> {
  const email = normalizeEmail(target.email);
  const domain = domainOf(email);
  if (!email || !domain) return true;
  const conds = [
    and(eq(doNotContact.kind, "email"), eq(doNotContact.value, email)),
    and(eq(doNotContact.kind, "domain"), eq(doNotContact.value, domain)),
  ];
  if (target.companyId) conds.push(and(eq(doNotContact.kind, "company"), eq(doNotContact.value, target.companyId.toLowerCase())));
  const rows = await db.select({ id: doNotContact.id }).from(doNotContact).where(or(...conds)).limit(1);
  return rows.length > 0;
}

/** Adds an entry; idempotent. Opt-outs are permanent — there is deliberately no remove function. */
export async function addToDnc(
  db: Db,
  entry: { kind: "email" | "domain" | "company"; value: string; reason: string },
): Promise<void> {
  const value =
    entry.kind === "email" ? normalizeEmail(entry.value) : entry.kind === "domain" ? domainOf(entry.value) : entry.value.trim().toLowerCase();
  if (!value) throw new Error(`DNC_INVALID_${entry.kind.toUpperCase()}`);
  await db.insert(doNotContact).values({ kind: entry.kind, value, reason: entry.reason }).onConflictDoNothing();
}

export type DncRow = { id: string; kind: "email" | "domain" | "company"; value: string; reason: string; createdAt: Date; companyId: string | null; companyName: string | null };

/** The do-not-contact list for the "Ne kontaktiraj" page, newest first, with the matching company when known. */
export async function listDnc(db: Db, q = "", limit = 500): Promise<DncRow[]> {
  const like = `%${q.trim().toLowerCase()}%`;
  const rows = (await db.execute(sql`
    select n.id, n.kind, n.value, n.reason, n.created_at as "createdAt", c.id as "companyId", c.name as "companyName"
    from do_not_contact n
    left join lateral (
      select co.id, co.name from companies co
      where (n.kind = 'company' and co.id::text = n.value)
         or (n.kind = 'email' and exists (select 1 from contacts ct where ct.company_id = co.id and ct.email = n.value))
         or (n.kind = 'domain' and co.website_domain = n.value)
      limit 1
    ) c on true
    where ${q.trim() ? sql`(n.value ilike ${like} or n.reason ilike ${like} or c.name ilike ${like})` : sql`true`}
    order by n.created_at desc
    limit ${limit}`)) as unknown as (Omit<DncRow, "createdAt"> & { createdAt: string | Date })[];
  return rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt) }));
}
