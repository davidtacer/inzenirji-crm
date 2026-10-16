import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { audits, companies, contacts, deals, drafts } from "../db/schema";
import { createCaptureMailer } from "../email/mailer";
import { approveDraft, createDueFollowUps, createFirstDraft, listDrafts } from "../outreach/drafts";
import { bounceStop, sendApprovedDraft, type OutreachConfig } from "../outreach/send";
import type { InboundMail } from "./classify";
import { conversation, listInbound, processInbound, processSent } from "./process";
import { importCompanyHistory } from "./sync";

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
    expect((await admin`select job, model from ai_usage where job = 'classify'`)).toEqual([{ job: "classify", model: "claude-haiku-5-5" }]);
    // The fake model answered the reply with JSON → rejected, logged as not ok, template used.
    expect((await admin`select ok from ai_usage where job = 'reply'`)).toEqual([{ ok: false }]);
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

describe("contextual reply (TASK-027)", () => {
  it("AI reads our e-mail and their answer and offers the next step instead of asking back", async () => {
    const { c, ourId } = await contacted("hana");
    const prompts: string[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { system: string; messages: { content: string }[]; model: string };
      prompts.push(`${body.system}\n---\n${body.messages[0].content}`);
      const text = body.model === "claude-haiku-5-5" ? '{"class":"interested"}' : "Pozdravljeni,\n\nodlično, kar dogovoriva se. Pokličite me na 041 111 222 ali mi pošljite svojo številko in vas pokličem jaz.\n\nLp, David";
      return new Response(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 500, output_tokens: 60 } }), { status: 200 });
    }) as unknown as typeof fetch;
    await processInbound(db, [mail({ from: "info@hana.si", inReplyTo: ourId, text: "Kdaj se lahko dogovorimo za klic? Me zanima." })], {
      ai: { apiKey: "K", model: "claude-sonnet-5-5", dailyBudgetMicroUsd: 1e6, fetchImpl },
      now: day(1),
      contact: { bookingUrl: null, phone: "041 111 222" },
    });
    const d = (await listDrafts(db)).pending.find((x) => x.companyId === c.id)!;
    expect(d.body).toBe("Pozdravljeni,\n\nodlično, kar dogovoriva se. Pokličite me na 041 111 222 ali mi pošljite svojo številko in vas pokličem jaz.\n\nLp,\nDavid\ninženirji.si");
    const replyPrompt = prompts.find((p) => p.includes("Njihov odgovor"))!;
    expect(replyPrompt).toContain("Kdaj se lahko dogovorimo za klic?");
    expect(replyPrompt).toContain("Tvoj zadnji e-mail njim:\nb");
    expect(replyPrompt).toContain("NE sprašuj nazaj");
    expect((await admin`select job from ai_usage order by job`).map((r) => r.job)).toEqual(["classify", "reply"]);
  });
});

describe("owner's own e-mails and history (TASK-029)", () => {
  it("Sent folder: stored when a recipient is a company, deal → contacted; CRM-sent and unknown recipients skipped", async () => {
    const [c] = await db.insert(companies).values({ name: "Fizis", websiteDomain: "fizis.si", website: "https://fizis.si" }).returning();
    await db.insert(deals).values({ companyId: c.id, source: "manual", stage: "researched" });
    const { ourId } = await contacted("iva");
    const r = await processSent(db, [
      mail({ from: "david@inzenirji.si", to: ["Info@Fizis.si"], subject: "Spletna stran za Fizis", text: "Pozdravljeni, ročno napisano." }),
      mail({ messageId: ourId, from: "david@inzenirji.si", to: ["info@iva.si"], text: "CRM" }),
      mail({ from: "david@inzenirji.si", to: ["prijatelj@gmail.com"], text: "zasebno" }),
    ], day(1));
    expect(r).toEqual({ seen: 3, stored: 1 });
    expect((await stage(c.id)).stage).toBe("contacted");
    const talk = await conversation(db, c.id);
    expect(talk).toMatchObject([{ dir: "out", via: "mail", label: "ročno", subject: "Spletna stran za Fizis", who: "Info@Fizis.si" }]);
    expect((await listInbound(db)).map((x) => x.companyName)).not.toContain("Fizis");
  });

  it("history import: stores both directions without effects ('ne' does not block), replied stage when they answered", async () => {
    const [c] = await db.insert(companies).values({ name: "Jure", websiteDomain: "jure.si", website: "https://jure.si" }).returning();
    await db.insert(deals).values({ companyId: c.id, source: "manual", stage: "researched" });
    await db.insert(contacts).values({ companyId: c.id, email: "jure@gmail.com", emailSource: "vnesel lastnik" });
    process.env.OUTREACH_SMTP_USER = "david@inzenirji.si";
    process.env.OUTREACH_SMTP_PASSWORD = "x";
    process.env.OUTREACH_SMTP_HOST = "imap.test";
    let asked: string[] = [];
    try {
      const r = await importCompanyHistory(db, c.id, {
        fetch: async (_cfg, terms) => {
          asked = terms;
          return {
            inbox: [mail({ from: "jure@gmail.com", text: "Ne, hvala.", date: day(-20) }), mail({ from: "info@jure.si", text: "Koliko stane?", date: day(-19) })],
            sent: [mail({ from: "david@inzenirji.si", to: ["jure@gmail.com"], text: "Pozdravljeni Jure", date: day(-21) })],
          };
        },
      });
      expect(r).toEqual({ ok: true, inbound: 2, sent: 1 });
    } finally {
      delete process.env.OUTREACH_SMTP_PASSWORD;
      delete process.env.OUTREACH_SMTP_HOST;
      delete process.env.OUTREACH_SMTP_USER;
    }
    expect(asked.sort()).toEqual(["@jure.si", "jure@gmail.com"]);
    expect((await admin`select count(*)::int n from do_not_contact`)[0].n).toBe(0);
    expect((await stage(c.id)).stage).toBe("replied");
    expect((await admin`select count(*)::int n from drafts where kind = 'reply'`)[0].n).toBe(0);
    expect((await conversation(db, c.id)).map((t) => t.dir)).toEqual(["out", "in", "in"]);
  });
});
