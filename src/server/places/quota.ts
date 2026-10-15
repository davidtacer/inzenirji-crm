import { sql } from "drizzle-orm";
import type { Db } from "../db/client";

export class QuotaError extends Error {
  constructor() {
    super("QUOTA_EXCEEDED");
  }
}

/** Today in Europe/Ljubljana as YYYY-MM-DD (the cap resets at local midnight). */
export function localDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana" }).format(now);
}

/**
 * Atomically reserves one paid call for `provider` today; throws QuotaError when the cap would be exceeded.
 * Insert-or-increment guarded by the cap in the same statement, so concurrent searches cannot overshoot.
 */
export async function reserveCall(db: Db, provider: string, cap: number, now = new Date()): Promise<number> {
  if (!Number.isInteger(cap) || cap < 1) throw new QuotaError();
  const day = localDay(now);
  const rows = await db.execute<{ count: number }>(sql`
    insert into api_calls (provider, day, count) values (${provider}, ${day}, 1)
    on conflict (provider, day) do update set count = api_calls.count + 1
    where api_calls.count < ${cap}
    returning count`);
  const n = (rows as unknown as { count: number }[])[0]?.count;
  if (n === undefined) throw new QuotaError();
  return n;
}

export async function callsToday(db: Db, provider: string, now = new Date()): Promise<number> {
  const rows = await db.execute<{ count: number }>(sql`select count from api_calls where provider = ${provider} and day = ${localDay(now)}`);
  return (rows as unknown as { count: number }[])[0]?.count ?? 0;
}
