import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { audits, companies, contacts, deals, drafts } from "../db/schema";
import { createCaptureMailer } from "../email/mailer";
import { approveDraft, createDueFollowUps, createFirstDraft, listDrafts } from "../outreach/drafts";
import { bounceStop, sendApprovedDraft, type OutreachConfig } from "../outreach/send";
import type { InboundMail } from "./classify";
import { processInbound } from "./process";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 4 });
const cfg: OutreachConfig = { enabled: true, dailyCap: 1, fromAddress: "david@inzenirji.si", appUrl: "https://crm.test", secret: "s" };
const T0 = new Date("2026-10-20T08:00:00Z");
const day = (n: number) => new Date(T0.getTime() + n * 86_400_000);

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies, do_not_contact, mailbox_state, ai_usage RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

/** A company that already got the first e-mail; returns the company and our Message-ID. */
async function contacted(name: string) {
  const [c] = await db.insert(companies).values({ name, city: "Celje", group: "A", website: `https://${name}.si`, websiteDomain: `${name}.si` }).returning();
  await db.insert(deals).values({ companyId: c.id, source: "places_search", stage: "researched" });
  await db.insert(audits).values({ companyId: c.id, data: {}, issues: [] });
  await db.insert(contacts).values({ companyId: c.id, email: `info@${name}.si`, emailSource: `https://${name}.si` });
  const r = await createFirstDraft(db, c.id);
  if (!r.ok) throw new Error(r.reason);
  await approveDraft(db, r.draftId, { subject: `Spletna stran za ${name}`, body: "b" }, T0);
  const mailer = createCaptureMailer();
  const s = await sendApprovedDraft(db, r.draftId, { mailer, config: { ...cfg, dailyCap: 100 }, now: T0 });
  if (!s.ok) throw new Error(s.error);
  return { c, ourId: mailer.sent[0].messageId!, mailer };
}

const mail = (over: Partial<InboundMail>): InboundMail => ({
  messageId: `<${Math.random()}@ext.si>`,
  from: "someone@else.si",
  subject: "Re: Spletna stran",
  text: "",
  date: day(1),
  inReplyTo: null,
  references: [],
  autoSubmitted: null,
  ...over,
});
const stage = async (id: string) => (await admin`select stage, next_action_at from deals where company_id = ${id}`)[0];

describe("mailbox processing", () => {
  it("sent mail carries our Message-ID; a question reply by thread stops follow-ups and drafts an answer in the thread", async () => {
    const { c, ourId } = await contacted("ana");
    expect(ourId).toMatch(/^<[0-9a-f-]{36}@inzenirji\.si>$/);
    expect((await admin`select message_id from drafts`)[0].message_id).toBe(ourId);

    const reply = mail({ from: "ANA@gmail.com", inReplyTo: ourId, text: "Koliko pa traja?\n\n> citat" });
    const r = await processInbound(db, [reply], { ai: null, now: day(1) });
    expect(r).toEqual({ seen: 1, stored: 1, byClass: { question: 1 } });
    expect((await stage(c.id)).stage).toBe("replied");
    const d = (await listDrafts(db)).pending;
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ kind: "reply", toEmail: "ana@gmail.com", subject: "Re: Spletna stran" });
    expect(d[0].body).toContain("[TUKAJ ODGOVORI NA VPRAŠANJE]");
    await expect(approveDraft(db, d[0].id, { subject: d[0].subject, body: d[0].body })).rejects.toThrow("DRAFT_PLACEHOLDER");
    expect(await createDueFollowUps(db, day(5))).toBe(0);
    expect((await admin`select count(*)::int n from activities where type = 'email_in'`)[0].n).toBe(1);

    // Same message again → ignored.
    expect((await processInbound(db, [reply], { ai: null, now: day(1) })).stored).toBe(0);

    // The reply goes out threaded and does not use the cold-mail cap (cap 1 is already used).
    await approveDraft(db, d[0].id, { subject: d[0].subject, body: "Pozdravljeni, okoli 7 dni." }, day(1));
    const mailer = createCaptureMailer();
    expect(await sendApprovedDraft(db, d[0].id, { mailer, config: cfg, now: T0 })).toEqual({ ok: true });
    expect(mailer.sent[0]).toMatchObject({ inReplyTo: reply.messageId, references: [reply.messageId] });
    expect((await stage(c.id)).stage).toBe("replied");
  });

  it("matches by known contact or own domain; unknown senders and free-mail domains are never stored", async () => {
    const { c } = await contacted("bor");
    const r = await processInbound(
      db,
      [mail({ from: "info@bor.si", text: "Pokličite me." }), mail({ from: "janez@bor.si", text: "Še eno vprašanje?" }), mail({ from: "spam@random.com", text: "Buy" })],
      { ai: null },
    );
    expect(r.stored).toBe(2);
    expect((await admin`select from_email from inbound_messages order by from_email`).map((x) => x.from_email)).toEqual(["info@bor.si", "janez@bor.si"]);
    expect((await admin`select count(*)::int n from inbound_messages where company_id = ${c.id}`)[0].n).toBe(2);
  });

  it("'ne' → do-not-contact + lost; not now → nurture in 90 days; out of office → only logged", async () => {
    const a = await contacted("cvet");
    const b = await contacted("dren");
    const o = await contacted("evka");
    await processInbound(
      db,
      [
        mail({ from: "info@cvet.si", text: "Ne, hvala." }),
        mail({ from: "info@dren.si", text: "Trenutno ne, morda spomladi." }),
        mail({ from: "info@evka.si", subject: "Automatic reply: Spletna stran", text: "Na dopustu do 1. 11." }),
      ],
      {
        ai: { apiKey: "K", model: "claude-sonnet-5-5", dailyBudgetMicroUsd: 1e6, fetchImpl: (async () => new Response(JSON.stringify({ content: [{ type: "text", text: '{"class":"not_now"}' }], usage: { input_tokens: 50, output_tokens: 5 } }), { status: 200 })) as unknown as typeof fetch },
        now: day(1),
      },
    );
    expect((await stage(a.c.id)).stage).toBe("lost");
    expect((await admin`select kind from do_not_contact where value = 'info@cvet.si'`)).toHaveLength(1);
    const dren = await stage(b.c.id);
    expect(dren.stage).toBe("nurture");
    expect(new Date(dren.next_action_at).getTime()).toBe(day(91).getTime());
    expect((await stage(o.c.id)).stage).toBe("contacted");
    expect((await admin`select job, model from ai_usage`)).toEqual([{ job: "classify", model: "claude-haiku-5-5" }]);
  });

  it("bounce found by our Message-ID in the body → address blocked, sequence stopped; bounce rate stops cold sending", async () => {
    const { c, ourId } = await contacted("fika");
    await processInbound(db, [mail({ from: "MAILER-DAEMON@mx.si", subject: "Undelivered Mail", text: `550 user unknown\nMessage-ID: ${ourId}` })], { ai: null, now: day(1) });
    expect((await admin`select reason from do_not_contact where value = 'info@fika.si'`)[0].reason).toMatch(/bounce/);
    expect((await stage(c.id)).next_action_at).toBeNull();
    expect(await bounceStop(db, day(1))).toBe(false); // only 1 sent, below the minimum of 20
    await admin`update drafts set sent_at = ${day(1)}`;
    // 19 more cold e-mails sent to other companies → 1 bounce / 20 sent = 5 % > 3 %.
    for (let i = 0; i < 19; i++) {
      const [x] = await db.insert(companies).values({ name: `X${i}` }).returning();
      const [dl] = await db.insert(deals).values({ companyId: x.id, source: "places_search", stage: "contacted" }).returning();
      await db.insert(drafts).values({ dealId: dl.id, kind: "first", toEmail: `x${i}@y.si`, subject: "s", body: "b", status: "sent", approvedAt: day(1), sentAt: day(1) });
    }
    expect(await bounceStop(db, day(2))).toBe(true);
  });

  it("follow-ups are threaded to the first e-mail", async () => {
    const { ourId } = await contacted("gaja");
    expect(await createDueFollowUps(db, day(3))).toBe(1);
    expect((await admin`select in_reply_to from drafts where kind = 'followup_1'`)[0].in_reply_to).toBe(ourId);
  });
});
