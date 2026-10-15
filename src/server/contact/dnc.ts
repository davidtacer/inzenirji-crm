import { and, eq, or } from "drizzle-orm";
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
