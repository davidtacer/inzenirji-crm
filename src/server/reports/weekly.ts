import { eq, sql } from "drizzle-orm";
import { callClaude } from "../ai/anthropic";
import { type AiConfig, spentTodayMicroUsd } from "../ai/remark";
import type { Db } from "../db/client";
import { aiUsage, weeklyReports } from "../db/schema";
import type { AdsWeek } from "../ads/meta";
import type { EditorStats } from "../demo/demo";
import type { SearchWeek } from "../google/searchconsole";
import type { Mailer } from "../email/mailer";
import { fromLocalInput, toLocalInput } from "@/lib/time";

/*
 * Weekly report (TASK-016, ADR-040). Numbers for one week (Monday 00:00 to Monday 00:00, Europe/Ljubljana) straight
 * from the CRM: leads per channel, outreach and replies, calls, proposals, sales, payments, launches, demo funnel,
 * AI cost, reply speed, what got replies, and 3 proposals for the coming week. Ads, GA4 and Search Console join with
 * TASK-015. A snapshot is stored per week and e-mailed to the owner on Monday at 08:00.
 */

export const TARGETS = { leadsPerWeek: 30, callsPerWeek: 7, salesPerMonth: 10, replyHours: 1, demoEmailPct: 15, cacCents: 15000 };

export const SOURCE_LABEL: Record<string, string> = {
  places_search: "Iskanje strank",
  outreach_reply: "Odgovor na e-mail",
  meta_lead_form: "Meta obrazec",
  google_ads: "Google oglasi",
  website_form: "Obrazec na strani",
  editor_demo: "Demo urejevalnika",
  site_audit: "Pregled strani",
  referral: "Priporočilo",
  partner: "Partner",
  manual: "Ročno",
};

export type ChannelRow = { source: string; leads: number; contacted: number; replies: number; calls: number; proposals: number; won: number };
export type WorkedRow = { label: string; sent: number; replies: number };

export type WeekData = {
  weekStart: string;
  from: string;
  to: string;
  /** True while the week is still running (numbers grow). */
  partial: boolean;
  leads: number;
  researched: number;
  outreach: { first: number; followups: number; replies: number; /** Inquiries from the website form (not replies to our e-mails). */ formLeads?: number; interested: number; no: number; bounces: number; optOuts: number };
  calls: number;
  proposals: { sent: number; accepted: number; acceptedNetCents: number };
  paid: { count: number; cents: number };
  launched: { count: number; onTime: number };
  monthSales: number;
  monthLabel: string;
  replyHoursMedian: number | null;
  ai: { microUsd: number; byJob: Record<string, number> };
  placesCalls: number;
  demo: { stats: EditorStats | null; days: number; leads: number; error: string | null };
  /** Meta Ads for the week (TASK-015); absent in reports made before it, null data = not connected or failed. */
  ads?: { data: AdsWeek | null; error: string | null };
  /** Google Search Console for the week (TASK-015). */
  search?: { data: SearchWeek | null; error: string | null };
  channels: ChannelRow[];
  worked: { categories: WorkedRow[]; groups: WorkedRow[] };
};

/* ---------------- dates (Europe/Ljubljana) ---------------- */

const DAY = 86_400_000;
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Monday (YYYY-MM-DD, Ljubljana) of the week that contains `at`. */
export function weekStartOf(at: Date): string {
  const local = toLocalInput(at).slice(0, 10);
  const wd = new Date(`${local}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(local, -((wd + 6) % 7));
}

export const previousWeek = (ws: string) => addDays(ws, -7);
export const nextWeek = (ws: string) => addDays(ws, 7);

export function weekBounds(ws: string): { from: Date; to: Date } {
  return { from: fromLocalInput(`${ws}T00:00`)!, to: fromLocalInput(`${addDays(ws, 7)}T00:00`)! };
}

/** "12. 10. - 18. 10. 2026" */
export function weekLabel(ws: string): string {
  const d = (ymd: string) => `${Number(ymd.slice(8, 10))}. ${Number(ymd.slice(5, 7))}.`;
  return `${d(ws)} - ${d(addDays(ws, 6))} ${addDays(ws, 6).slice(0, 4)}`;
}

const MONTHS = ["januar", "februar", "marec", "april", "maj", "junij", "julij", "avgust", "september", "oktober", "november", "december"];

/* ---------------- numbers ---------------- */

const n = (v: unknown) => Number(v ?? 0) || 0;

export type Fetchers = {
  editorStats?: (days: number) => Promise<{ stats: EditorStats | null; error: string | null }>;
  /** Dates are inclusive YYYY-MM-DD (Ljubljana). */
  ads?: (since: string, until: string) => Promise<{ data: AdsWeek | null; error: string | null }>;
  search?: (since: string, until: string) => Promise<{ data: SearchWeek | null; error: string | null }>;
};

export async function collectWeek(db: Db, ws: string, opts: { now?: Date } & Fetchers = {}): Promise<WeekData> {
  const now = opts.now ?? new Date();
  const { from, to } = weekBounds(ws);
  const end = to < now ? to : now;
  const f = from.toISOString();
  const t = to.toISOString();
  const run = async <T extends Record<string, unknown>>(q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as T[];

  const [counts] = await run<Record<string, unknown>>(sql`
    select
      (select count(*) from deals where created_at >= ${f} and created_at < ${t}) as leads,
      (select count(distinct company_id) from audits where created_at >= ${f} and created_at < ${t}) as researched,
      (select count(*) from drafts where status = 'sent' and kind = 'first' and sent_at >= ${f} and sent_at < ${t}) as first,
      (select count(*) from drafts where status = 'sent' and kind in ('followup_1','followup_2') and sent_at >= ${f} and sent_at < ${t}) as followups,
      (select count(*) from inbound_messages where direction = 'in' and classified_by <> 'form' and classification not in ('out_of_office','bounce') and received_at >= ${f} and received_at < ${t}) as replies,
      (select count(*) from inbound_messages where direction = 'in' and classified_by <> 'form' and classification = 'interested' and received_at >= ${f} and received_at < ${t}) as interested,
      (select count(*) from inbound_messages where direction = 'in' and classified_by <> 'form' and classification = 'no' and received_at >= ${f} and received_at < ${t}) as no,
      (select count(*) from inbound_messages where direction = 'in' and classified_by <> 'form' and classification = 'bounce' and received_at >= ${f} and received_at < ${t}) as bounces,
      (select count(*) from inbound_messages where direction = 'in' and classified_by = 'form' and received_at >= ${f} and received_at < ${t}) as form_leads,
      (select count(*) from do_not_contact where created_at >= ${f} and created_at < ${t}) as opt_outs,
      (select count(*) from proposals where sent_at >= ${f} and sent_at < ${t}) as p_sent,
      (select count(*) from proposals where status = 'accepted' and accepted_at >= ${f} and accepted_at < ${t}) as p_acc,
      (select coalesce(sum((select coalesce(sum((i->>'priceCents')::bigint), 0) from jsonb_array_elements(items) i)), 0) from proposals where status = 'accepted' and accepted_at >= ${f} and accepted_at < ${t}) as p_acc_net,
      (select coalesce(sum(count), 0) from api_calls where day >= ${ws}::date and day < ${addDays(ws, 7)}::date) as places_calls,
      (select count(*) from deals where source = 'editor_demo' and created_at >= ${f} and created_at < ${t}) as demo_leads
  `);

  // Calls: calendar events linked to a company, plus agreed call times on deals (one per company).
  const [calls] = await run<{ n: unknown }>(sql`
    select count(*) as n from (
      select company_id from calendar_events where company_id is not null and status <> 'cancelled' and start_at >= ${f} and start_at < ${t}
      union
      select company_id from deals where call_at >= ${f} and call_at < ${t}
    ) x`);

  // Payments the owner marked: deposit (project start) and the rest (final payment).
  const [paid] = await run<{ count: unknown; cents: unknown }>(sql`
    select count(*) as count, coalesce(sum(amount), 0) as cents from (
      select coalesce(p.deposit_cents, 0) as amount from projects p where p.deposit_paid_at >= ${f} and p.deposit_paid_at < ${t}
      union all
      select greatest(coalesce(round(net.v * (1 + pr.vat_rate_bp / 10000.0)), 0) - coalesce(p.deposit_cents, 0), 0) as amount
      from projects p
      left join proposals pr on pr.id = p.proposal_id
      left join lateral (select coalesce(sum((i->>'priceCents')::bigint), 0) as v from jsonb_array_elements(coalesce(pr.items, '[]'::jsonb)) i) net on true
      where p.final_paid_at >= ${f} and p.final_paid_at < ${t}
    ) x`);

  // Launches and whether they made the guarantee (confirmed + timeline + paused time).
  const [launched] = await run<{ count: unknown; on_time: unknown }>(sql`
    select count(*) as count, count(*) filter (where p.confirmed_at is not null and p.launched_at <= p.confirmed_at + make_interval(days => p.timeline_days) + coalesce((
      select sum(coalesce(x.end_at, p.launched_at) - x.start_at) from project_pauses x where x.project_id = p.id and x.start_at >= p.confirmed_at
    ), interval '0')) as on_time
    from projects p where p.launched_at >= ${f} and p.launched_at < ${t}`);

  // Sales this calendar month (Ljubljana) up to the end of the week.
  const monthStart = `${toLocalInput(new Date(end.getTime() - 1)).slice(0, 7)}-01`;
  const mFrom = fromLocalInput(`${monthStart}T00:00`)!.toISOString();
  const [month] = await run<{ n: unknown }>(sql`select count(*) as n from proposals where status = 'accepted' and accepted_at >= ${mFrom} and accepted_at < ${end.toISOString()}`);

  // Median time from a prospect's reply to our next e-mail to them (CRM reply or one sent from the mailbox).
  const [speed] = await run<{ h: unknown }>(sql`
    select percentile_cont(0.5) within group (order by extract(epoch from (r.answered - r.received_at)) / 3600.0) as h from (
      select m.received_at, (
        select min(x.at) from (
          select d.sent_at as at from drafts d join deals dl on dl.id = d.deal_id where dl.company_id = m.company_id and d.status = 'sent' and d.sent_at > m.received_at
          union all
          select o.received_at from inbound_messages o where o.company_id = m.company_id and o.direction = 'out' and o.received_at > m.received_at
        ) x
      ) as answered
      from inbound_messages m
      where m.direction = 'in' and m.classified_by <> 'form' and m.classification in ('interested','question','not_now') and m.received_at >= ${f} and m.received_at < ${t}
    ) r where r.answered is not null`);

  const ai = await run<{ job: string; c: unknown }>(sql`select job, coalesce(sum(cost_micro_usd), 0) as c from ai_usage where created_at >= ${f} and created_at < ${t} group by job`);

  const channels = await run<Record<string, unknown>>(sql`
    select d.source,
      count(*) filter (where d.created_at >= ${f} and d.created_at < ${t}) as leads,
      count(*) filter (where exists (select 1 from drafts x where x.deal_id = d.id and x.kind = 'first' and x.status = 'sent' and x.sent_at >= ${f} and x.sent_at < ${t})) as contacted,
      count(*) filter (where exists (select 1 from inbound_messages x where x.company_id = d.company_id and x.direction = 'in' and x.classified_by <> 'form' and x.classification not in ('out_of_office','bounce') and x.received_at >= ${f} and x.received_at < ${t})) as replies,
      count(*) filter (where exists (select 1 from calendar_events x where x.company_id = d.company_id and x.status <> 'cancelled' and x.start_at >= ${f} and x.start_at < ${t}) or (d.call_at >= ${f} and d.call_at < ${t})) as calls,
      count(*) filter (where exists (select 1 from proposals x where x.deal_id = d.id and x.sent_at >= ${f} and x.sent_at < ${t})) as proposals,
      count(*) filter (where exists (select 1 from proposals x where x.deal_id = d.id and x.status = 'accepted' and x.accepted_at >= ${f} and x.accepted_at < ${t})) as won
    from deals d group by d.source`);

  // What got replies: first e-mails of the last 4 weeks up to the end of this week, by category and offer group.
  const wFrom = new Date(to.getTime() - 28 * DAY).toISOString();
  const worked = await run<{ kind: string; label: string | null; sent: unknown; replies: unknown }>(sql`
    with sent as (
      select dl.company_id, c.category, c.offer_group::text as grp, d.sent_at
      from drafts d join deals dl on dl.id = d.deal_id join companies c on c.id = dl.company_id
      where d.kind = 'first' and d.status = 'sent' and d.sent_at >= ${wFrom} and d.sent_at < ${t}
    ), r as (
      select s.*, exists (select 1 from inbound_messages m where m.company_id = s.company_id and m.direction = 'in' and m.classified_by <> 'form' and m.classification not in ('out_of_office','bounce') and m.received_at > s.sent_at) as replied from sent s
    )
    select 'category' as kind, coalesce(category, 'brez kategorije') as label, count(*) as sent, count(*) filter (where replied) as replies from r group by 2
    union all
    select 'group', coalesce(grp, '?'), count(*), count(*) filter (where replied) from r group by 2`);

  const days = Math.max(1, Math.ceil((end.getTime() - from.getTime()) / DAY));
  const demo = opts.editorStats ? await opts.editorStats(days).catch(() => ({ stats: null, error: "Urejevalnik ni dosegljiv." })) : { stats: null, error: null };
  const until = toLocalInput(new Date(end.getTime() - 1)).slice(0, 10);
  const [ads, search] = await Promise.all([
    opts.ads ? opts.ads(ws, until).catch(() => ({ data: null, error: "Branje Meta oglasov ni uspelo." })) : undefined,
    opts.search ? opts.search(ws, until).catch(() => ({ data: null, error: "Branje Search Console ni uspelo." })) : undefined,
  ]);

  const byJob = Object.fromEntries(ai.map((r) => [r.job, n(r.c)]));
  const toRow = (r: { label: string | null; sent: unknown; replies: unknown }) => ({ label: r.label ?? "?", sent: n(r.sent), replies: n(r.replies) });
  const monthEnd = toLocalInput(new Date(end.getTime() - 1));
  return {
    weekStart: ws,
    from: from.toISOString(),
    to: to.toISOString(),
    partial: now < to,
    leads: n(counts.leads),
    researched: n(counts.researched),
    outreach: {
      first: n(counts.first),
      followups: n(counts.followups),
      formLeads: n(counts.form_leads),
      replies: n(counts.replies),
      interested: n(counts.interested),
      no: n(counts.no),
      bounces: n(counts.bounces),
      optOuts: n(counts.opt_outs),
    },
    calls: n(calls?.n),
    proposals: { sent: n(counts.p_sent), accepted: n(counts.p_acc), acceptedNetCents: n(counts.p_acc_net) },
    paid: { count: n(paid?.count), cents: n(paid?.cents) },
    launched: { count: n(launched?.count), onTime: n(launched?.on_time) },
    monthSales: n(month?.n),
    monthLabel: MONTHS[Number(monthEnd.slice(5, 7)) - 1] ?? "",
    replyHoursMedian: speed?.h === null || speed?.h === undefined ? null : Math.round(n(speed.h) * 100) / 100,
    ai: { microUsd: Object.values(byJob).reduce((a, b) => a + b, 0), byJob },
    placesCalls: n(counts.places_calls),
    demo: { stats: demo.stats, days, leads: n(counts.demo_leads), error: demo.error },
    ...(ads ? { ads } : {}),
    ...(search ? { search } : {}),
    channels: channels
      .map((r) => ({ source: String(r.source), leads: n(r.leads), contacted: n(r.contacted), replies: n(r.replies), calls: n(r.calls), proposals: n(r.proposals), won: n(r.won) }))
      .filter((r) => r.leads + r.contacted + r.replies + r.calls + r.proposals + r.won > 0)
      .sort((a, b) => b.won - a.won || b.calls - a.calls || b.replies - a.replies || b.leads - a.leads),
    worked: {
      categories: worked.filter((r) => r.kind === "category").map(toRow).sort((a, b) => rate(b) - rate(a) || b.sent - a.sent),
      groups: worked.filter((r) => r.kind === "group").map(toRow).sort((a, b) => a.label.localeCompare(b.label)),
    },
  };
}

/** Ad spend per sale this week; null without ad data or sales. */
export const cacCents = (d: WeekData) => (d.ads?.data && d.proposals.accepted ? Math.round(d.ads.data.spendCents / d.proposals.accepted) : null);
/** Ad spend per Meta lead. */
export const cplCents = (d: WeekData) => (d.ads?.data?.leads ? Math.round(d.ads.data.spendCents / d.ads.data.leads) : null);

/** "25 min" under an hour, else "3,5 h". */
export const fmtHours = (h: number | null) => (h === null ? "-" : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${String(Math.round(h * 10) / 10).replace(".", ",")} h`);

export const rate = (r: { sent: number; replies: number }) => (r.sent ? r.replies / r.sent : 0);
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
export const eur = (cents: number) => `${(cents / 100).toLocaleString("sl-SI", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })} €`;
export const usd = (micro: number) => `${(micro / 1_000_000).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

/* ---------------- suggestions ---------------- */

/** Rule-based proposals, used when AI is off or fails. Always returns 3. */
export function ruleSuggestions(d: WeekData): string[] {
  const out: string[] = [];
  const best = d.worked.categories.find((c) => c.sent >= 3 && c.replies > 0);
  if (d.leads < TARGETS.leadsPerWeek) out.push(`Dodaj vsaj ${TARGETS.leadsPerWeek - d.leads} novih podjetij v Iskanju strank${best ? ` - najbolje odgovarja panoga »${best.label}«` : ""}.`);
  if (d.outreach.first < 25) out.push(`Pošlji več prvih e-mailov: ta teden ${d.outreach.first}. Cilj je okoli 30 na teden, da pridemo do 7 klicev.`);
  if (d.outreach.replies && d.replyHoursMedian !== null && d.replyHoursMedian > TARGETS.replyHours) out.push(`Odgovarjaj hitreje: polovica odgovorov je čakala več kot ${fmtHours(d.replyHoursMedian)}. Cilj je pod 1 h.`);
  if (d.calls < TARGETS.callsPerWeek) out.push(`Klicev je bilo ${d.calls}, cilj je ${TARGETS.callsPerWeek}. Zainteresiranim v odgovoru vedno ponudi termin za klic.`);
  if (d.demo.stats && d.demo.stats.visits >= 10 && pct(d.demo.stats.emails, d.demo.stats.visits) < TARGETS.demoEmailPct) out.push(`Demo je odprlo ${d.demo.stats.visits} ljudi, e-naslov jih je pustilo ${d.demo.stats.emails}. Preveri, ali je ponudba za e-naslov v demu dovolj jasna.`);
  if (d.ads?.data && d.ads.data.spendCents >= 2000 && d.ads.data.leads === 0) out.push(`Oglasi so porabili ${eur(d.ads.data.spendCents)} brez leadov. Preveri oglas in stran, kamor vodi (npr. demo).`);
  if (d.proposals.sent > d.proposals.accepted) out.push("Pokliči tiste, ki so ponudbo dobili, a je še niso potrdili.");
  out.push("Za vsako zainteresirano podjetje naredi Google pregled in preveri, da imaš pravi e-naslov.");
  out.push("V e-mailih izpostavi AI urejevalnik in povezavo na demo.");
  return out.slice(0, 3);
}

const SYSTEM = `Si poslovni svetovalec za David Tacerja (inženirji.si, Maribor), ki prodaja spletne strani malim podjetjem v Sloveniji (nova stran 590 € + DDV v 7 dneh, AI urejevalnik, kjer stranka stran ureja s pogovorom). Cilj je 10 prodanih strani na mesec. Iz številk tega tedna predlagaj natanko 3 konkretne stvari za naslednji teden, vsako v enem stavku, ki jih David lahko naredi v CRM-ju (iskanje strank, e-maili, odgovori, klici, ponudbe, demo urejevalnika). Opri se samo na številke. Piši v slovenščini, vikanje ni potrebno, uporabljaj navaden vezaj (-), ne dolgih pomišljajev. Odgovori samo z JSON: {"suggestions": ["...", "...", "..."]}`;

export async function suggestions(db: Db, d: WeekData, prev: WeekData | null, ai: AiConfig | null): Promise<{ list: string[]; by: string }> {
  if (!ai) return { list: ruleSuggestions(d), by: "rules" };
  if ((await spentTodayMicroUsd(db)) >= ai.dailyBudgetMicroUsd) return { list: ruleSuggestions(d), by: "rules" };
  const strip = (x: WeekData) => ({ ...x, worked: { categories: x.worked.categories.slice(0, 8), groups: x.worked.groups } });
  try {
    const r = await callClaude(
      { model: ai.model, system: SYSTEM, user: JSON.stringify({ cilji: TARGETS, ta_teden: strip(d), prejsnji_teden: prev ? strip(prev) : null }), maxTokens: 600 },
      { apiKey: ai.apiKey, fetchImpl: ai.fetchImpl, timeoutMs: 60_000 },
    );
    await db.insert(aiUsage).values({ job: "weekly_report", model: ai.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costMicroUsd: r.costMicroUsd, ok: true });
    const m = r.text.match(/\{[\s\S]*\}/);
    const list = ((m ? (JSON.parse(m[0]) as { suggestions?: unknown }).suggestions : null) ?? []) as unknown[];
    const clean = list.filter((s): s is string => typeof s === "string" && s.trim().length > 5).map((s) => s.trim().replace(/[—–]/g, "-")).slice(0, 3);
    if (clean.length < 3) return { list: ruleSuggestions(d), by: "rules" };
    return { list: clean, by: ai.model };
  } catch (e) {
    console.error("[weekly] suggestions failed:", e instanceof Error ? e.message.slice(0, 120) : "unknown");
    return { list: ruleSuggestions(d), by: "rules" };
  }
}

/* ---------------- snapshot, e-mail ---------------- */

export type Report = { data: WeekData; suggestions: string[]; suggestionsBy: string; generatedAt: Date; sentAt: Date | null; sendError: string | null };

export async function storedReport(db: Db, ws: string): Promise<Report | null> {
  const [r] = await db.select().from(weeklyReports).where(eq(weeklyReports.weekStart, ws));
  if (!r) return null;
  return { data: r.data as WeekData, suggestions: r.suggestions as string[], suggestionsBy: r.suggestionsBy, generatedAt: r.generatedAt, sentAt: r.sentAt, sendError: r.sendError };
}

export type ReportDeps = {
  ai: AiConfig | null;
  editorStats?: Fetchers["editorStats"];
  ads?: Fetchers["ads"];
  search?: Fetchers["search"];
  mailer: Mailer | null;
  to: string | null;
  appUrl: string;
  now?: Date;
};

/** Makes (or refreshes) the snapshot for a week and e-mails it. Suggestions are kept once made. */
export async function makeReport(db: Db, ws: string, deps: ReportDeps, opts: { send: boolean } = { send: true }): Promise<Report> {
  const now = deps.now ?? new Date();
  const data = await collectWeek(db, ws, { now, editorStats: deps.editorStats, ads: deps.ads, search: deps.search });
  const old = await storedReport(db, ws);
  const prev = (await storedReport(db, previousWeek(ws)))?.data ?? (await collectWeek(db, previousWeek(ws), { now }));
  const sug = old && old.suggestionsBy !== "rules" && old.suggestions.length === 3 && !old.data.partial ? { list: old.suggestions, by: old.suggestionsBy } : await suggestions(db, data, prev, deps.ai);
  const row = { weekStart: ws, data, suggestions: sug.list, suggestionsBy: sug.by, generatedAt: now };
  await db.insert(weeklyReports).values(row).onConflictDoUpdate({ target: weeklyReports.weekStart, set: { data, suggestions: sug.list, suggestionsBy: sug.by, generatedAt: now } });
  let sentAt: Date | null = old?.sentAt ?? null;
  let sendError: string | null = null;
  if (opts.send) {
    if (!deps.mailer || !deps.to) sendError = "E-pošta ali OWNER_EMAILS ni nastavljena.";
    else {
      try {
        const m = renderEmail(data, prev, sug.list, deps.appUrl);
        await deps.mailer.send({ to: deps.to, subject: m.subject, text: m.text, html: m.html });
        sentAt = now;
      } catch (e) {
        sendError = e instanceof Error ? e.message.slice(0, 200) : "Pošiljanje ni uspelo.";
      }
    }
    await db.update(weeklyReports).set({ sentAt, sendError }).where(eq(weeklyReports.weekStart, ws));
  }
  return { data, suggestions: sug.list, suggestionsBy: sug.by, generatedAt: now, sentAt, sendError };
}

function delta(a: number, b: number | undefined): string {
  if (b === undefined) return "";
  const d = a - b;
  return d === 0 ? " (enako)" : ` (${d > 0 ? "+" : ""}${d})`;
}

export function headline(d: WeekData): string {
  return `${d.leads} novih, ${d.outreach.first} e-mailov, ${d.outreach.replies} odgovorov, ${d.calls} klicev, ${d.proposals.accepted} prodaj`;
}

export function renderEmail(d: WeekData, prev: WeekData | null, sug: string[], appUrl: string): { subject: string; text: string; html: string } {
  const p = prev ?? undefined;
  const lines: [string, string][] = [
    ["Novi leadi", `${d.leads}${delta(d.leads, p?.leads)} / cilj ${TARGETS.leadsPerWeek}`],
    ["Raziskana podjetja", `${d.researched}`],
    ["Prvi e-maili", `${d.outreach.first}${delta(d.outreach.first, p?.outreach.first)}`],
    ["Opomniki", `${d.outreach.followups}`],
    ["Odgovori", `${d.outreach.replies}${delta(d.outreach.replies, p?.outreach.replies)} (${pct(d.outreach.replies, d.outreach.first)} % od prvih e-mailov), zainteresiranih ${d.outreach.interested}, »ne« ${d.outreach.no}`],
    ["Čas do odgovora (mediana)", d.replyHoursMedian === null ? "-" : `${fmtHours(d.replyHoursMedian)} / cilj pod ${TARGETS.replyHours} h`],
    ["Povpraševanja z obrazca", `${d.outreach.formLeads ?? 0}`],
    ["Klici", `${d.calls}${delta(d.calls, p?.calls)} / cilj ${TARGETS.callsPerWeek}`],
    ["Ponudbe poslane / potrjene", `${d.proposals.sent} / ${d.proposals.accepted} (${eur(d.proposals.acceptedNetCents)} brez DDV)`],
    [`Prodaje v mesecu (${d.monthLabel})`, `${d.monthSales} / cilj ${TARGETS.salesPerMonth}`],
    ["Plačila (označena)", `${d.paid.count} (${eur(d.paid.cents)})`],
    ["Objavljene strani", `${d.launched.count}${d.launched.count ? `, v roku ${d.launched.onTime}` : ""}`],
    ["Demo urejevalnika", d.demo.stats ? `${d.demo.stats.visits} obiskov, ${d.demo.stats.edited} urejalo, ${d.demo.stats.emails} e-naslovov (${pct(d.demo.stats.emails, d.demo.stats.visits)} %), ${d.demo.leads} v CRM` : `${d.demo.leads} v CRM${d.demo.error ? ` (${d.demo.error})` : ""}`],
    ["Meta oglasi", d.ads?.data ? `${eur(d.ads.data.spendCents)}, ${d.ads.data.clicks} klikov, ${d.ads.data.leads} leadov${cplCents(d) !== null ? ` (${eur(cplCents(d)!)} na lead)` : ""}` : (d.ads?.error ?? "ni povezano")],
    ["CAC (oglasi na prodajo)", cacCents(d) !== null ? eur(cacCents(d)!) : "-"],
    ["Google iskanje", d.search?.data ? `${d.search.data.clicks} klikov, ${d.search.data.impressions} prikazov${d.search.data.position ? `, povprečni položaj ${String(d.search.data.position).replace(".", ",")}` : ""}` : (d.search?.error ?? "ni povezano")],
    ["Stroški AI", usd(d.ai.microUsd)],
    ["Odjave / nedostavljeni", `${d.outreach.optOuts} / ${d.outreach.bounces}`],
  ];
  const ch = d.channels.map((c) => `${SOURCE_LABEL[c.source] ?? c.source}: ${c.leads} novih, ${c.contacted} kontaktiranih, ${c.replies} odgovorov, ${c.calls} klicev, ${c.proposals} ponudb, ${c.won} prodaj`);
  const best = d.worked.categories.filter((c) => c.sent >= 3).slice(0, 3).map((c) => `${c.label}: ${c.replies}/${c.sent} odgovorov (${pct(c.replies, c.sent)} %)`);
  const url = `${appUrl.replace(/\/+$/, "")}/porocila?w=${d.weekStart}`;
  const subject = `Tedensko poročilo ${weekLabel(d.weekStart)}: ${d.calls} klicev, ${d.proposals.accepted} prodaj`;
  const text = [
    `Tedensko poročilo ${weekLabel(d.weekStart)}`,
    "",
    ...lines.map(([k, v]) => `${k}: ${v}`),
    "",
    "Po kanalih:",
    ...(ch.length ? ch.map((x) => `- ${x}`) : ["- ni aktivnosti"]),
    "",
    "Kaj dobi odgovore (zadnji 4 tedni, panoge z vsaj 3 e-maili):",
    ...(best.length ? best.map((x) => `- ${x}`) : ["- premalo poslanih e-mailov"]),
    "",
    "3 predlogi za ta teden:",
    ...sug.map((s, i) => `${i + 1}. ${s}`),
    "",
    `Celotno poročilo: ${url}`,
  ].join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const td = 'style="padding:4px 12px 4px 0;border-bottom:1px solid #eee;vertical-align:top"';
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
<h2 style="font-size:18px">Tedensko poročilo ${esc(weekLabel(d.weekStart))}</h2>
<table style="border-collapse:collapse">${lines.map(([k, v]) => `<tr><td ${td}><b>${esc(k)}</b></td><td ${td}>${esc(v)}</td></tr>`).join("")}</table>
<h3 style="font-size:15px">Po kanalih</h3><ul>${(ch.length ? ch : ["ni aktivnosti"]).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<h3 style="font-size:15px">Kaj dobi odgovore (zadnji 4 tedni)</h3><ul>${(best.length ? best : ["premalo poslanih e-mailov"]).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<h3 style="font-size:15px">3 predlogi za ta teden</h3><ol>${sug.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
<p><a href="${esc(url)}">Celotno poročilo v CRM</a></p></div>`;
  return { subject, text, html };
}

/* ---------------- schedule ---------------- */

/** The week whose report is due at `now` (Monday 08:00 Ljubljana or later), or null before that. */
export function dueWeek(now: Date): string {
  return previousWeek(weekStartOf(now));
}

export function isDue(now: Date): boolean {
  const ws = weekStartOf(now);
  return now.getTime() >= fromLocalInput(`${ws}T08:00`)!.getTime();
}

