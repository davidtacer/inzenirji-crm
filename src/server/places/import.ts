import { and, eq, isNull, or, sql } from "drizzle-orm";
import { domainOf } from "../contact/normalize";
import type { Db } from "../db/client";
import { companies, deals } from "../db/schema";
import type { Place } from "./client";

/** Default selection rule (spec §5.1): a working business — rating ≥ 4.3 and ≥ 30 reviews. */
export function isGoodBusiness(p: { ratingX10: number | null; reviewCount: number | null }): boolean {
  return (p.ratingX10 ?? 0) >= 43 && (p.reviewCount ?? 0) >= 30;
}

const digits = (s: string | null) => (s ? s.replace(/\D/g, "") : "");

export type ImportResult = { created: number; updated: number };

/**
 * Stores search results. Dedupe: same place id → update; otherwise same website domain or phone on a company
 * without a place id → attach the place id and update; otherwise insert. Every new company gets a deal
 * (stage `found`, source `places_search`). Existing deals are never touched.
 */
export async function importPlaces(db: Db, places: Place[], country = "SI"): Promise<ImportResult> {
  let created = 0;
  let updated = 0;
  for (const p of places) {
    const websiteDomain = domainOf(p.website);
    const values = {
      country,
      name: p.name,
      category: p.category,
      address: p.address,
      city: p.city,
      phone: p.phone,
      website: p.website,
      websiteDomain,
      placeId: p.placeId,
      ratingX10: p.ratingX10,
      reviewCount: p.reviewCount,
      updatedAt: new Date(),
    };
    await db.transaction(async (tx) => {
      const byPlace = await tx.select({ id: companies.id }).from(companies).where(eq(companies.placeId, p.placeId)).limit(1);
      let id: string | undefined = byPlace[0]?.id;
      if (!id) {
        const conds = [];
        if (websiteDomain) conds.push(eq(companies.websiteDomain, websiteDomain));
        const phoneDigits = digits(p.phone);
        if (phoneDigits.length >= 6) conds.push(sql`regexp_replace(${companies.phone}, '\\D', '', 'g') = ${phoneDigits}`);
        if (conds.length) {
          const candidates = await tx
            .select({ id: companies.id, phone: companies.phone, websiteDomain: companies.websiteDomain })
            .from(companies)
            .where(and(isNull(companies.placeId), or(...conds)))
            .limit(5);
          id = candidates.find(
            (c) => (websiteDomain && c.websiteDomain === websiteDomain) || (digits(c.phone).length >= 6 && digits(c.phone) === digits(p.phone)),
          )?.id;
        }
      }
      if (id) {
        await tx.update(companies).set(values).where(eq(companies.id, id));
        updated++;
      } else {
        const [c] = await tx.insert(companies).values(values).returning({ id: companies.id });
        id = c.id;
        created++;
      }
      await tx.insert(deals).values({ companyId: id, source: "places_search" }).onConflictDoNothing();
    });
  }
  return { created, updated };
}
