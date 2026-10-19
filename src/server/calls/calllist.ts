import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { activities, deals, drafts } from "../db/schema";
import { remarkFor, type ComposeInput } from "../outreach/compose";
import type { Issue } from "../research/analyze";

/*
 * Phone channel (ADR-044). Leads we cannot e-mail (no valid address) or that the owner chose to phone go to the
 * "Za klic" list with what to say: phone, short summary and the same personal remark the e-mail would open with.
 */

export type CallItem = {
  companyId: string;
  name: string;
  category: string | null;
  city: string | null;
  phone: string;
  score: number | null;
  group: "A" | "B" | null;
  stage: string;
  why: "manual" | "no_email";
  summary: string | null;
  remark: string;
  facts: string[];
};

export async function callList(db: Db, now = new Date(), limit = 100): Promise<CallItem[]> {
  const rows = (await db.execute(sql`
    select c.id, c.name, c.category, c.city, c.phone, c.score, c.offer_group as "group", c.rating_x10 as "ratingX10", c.review_count as "reviewCount",
      c.website_domain as "websiteDomain", d.stage, d.channel,
      a.summary, a.issues, a.data->'ai'->>'remark' as "aiRemark", a.data->'web'->>'summary' as "webSummary", a.data->'web'->'facts' as facts
    from companies c
    join deals d on d.company_id = c.id
    left join lateral (select summary, issues, data from audits where company_id = c.id order by created_at desc limit 1) a on true
    where not c.is_test
      and c.phone is not null and c.phone <> ''
      and d.stage in ('found', 'researched', 'contacted')
      and (d.next_action_at is null or d.next_action_at <= ${now.toISOString()} or d.stage <> 'contacted')
      and (d.call_later_at is null or d.call_later_at <= ${now.toISOString()})
      and (d.channel = 'call' or not exists (select 1 from contacts ct where ct.company_id = c.id and ct.email is not null and ct.invalid_at is null))
      and not exists (select 1 from do_not_contact n where n.kind = 'company' and n.value = c.id::text)
    order by c.score desc nulls last, c.review_count desc nulls last
    limit ${limit}`)) as unknown as Record<string, unknown>[];
  return rows.map((r) => {
    const input: ComposeInput = {
      name: String(r.name),
      city: (r.city as string) ?? null,
      group: (r.group as "A" | "B" | null) ?? null,
      websiteDomain: (r.websiteDomain as string) ?? null,
      ratingX10: (r.ratingX10 as number) ?? null,
      reviewCount: (r.reviewCount as number) ?? null,
      issues: ((r.issues as Issue[] | null) ?? []) as Issue[],
      aiRemark: (r.aiRemark as string) ?? null,
    };
    return {
      companyId: String(r.id),
      name: String(r.name),
      category: (r.category as string) ?? null,
      city: (r.city as string) ?? null,
      phone: String(r.phone),
      score: (r.score as number) ?? null,
      group: input.group,
      stage: String(r.stage),
      why: r.channel === "call" ? "manual" : "no_email",
      summary: (r.webSummary as string) || (r.summary as string) || null,
      remark: `Opazil sem, da ${remarkFor(input)}.`,
      facts: Array.isArray(r.facts) ? (r.facts as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 3) : [],
    };
  });
}

/** Owner: phone this lead instead of e-mailing (or back to e-mail). Open cold e-mails are discarded when moving to the phone. */
export async function setChannel(db: Db, companyId: string, channel: "call" | null, now = new Date()) {
  const [d] = await db.select().from(deals).where(eq(deals.companyId, companyId)).limit(1);
  if (!d) return false;
  await db.update(deals).set({ channel, updatedAt: now }).where(eq(deals.id, d.id));
  if (channel === "call")
    await db
      .update(drafts)
      .set({ status: "discarded" })
      .where(and(eq(drafts.dealId, d.id), inArray(drafts.status, ["pending", "approved"]), inArray(drafts.kind, ["first", "followup_1", "followup_2"])));
  await db.insert(activities).values({ dealId: d.id, type: "note", at: now, payload: { kind: "channel", channel: channel ?? "email" } });
  return true;
}

/** Owner: did not reach them, show again in `days` days. */
export async function callLater(db: Db, companyId: string, days = 2, now = new Date()) {
  await db.update(deals).set({ callLaterAt: new Date(now.getTime() + days * 86_400_000), updatedAt: now }).where(eq(deals.companyId, companyId));
  const [d] = await db.select({ id: deals.id }).from(deals).where(eq(deals.companyId, companyId)).limit(1);
  if (d) await db.insert(activities).values({ dealId: d.id, type: "call", at: now, payload: { kind: "no_answer", again: days } });
}
