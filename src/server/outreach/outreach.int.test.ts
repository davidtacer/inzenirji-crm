import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addToDnc, listDnc } from "../contact/dnc";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { audits, companies, contacts, deals, drafts } from "../db/schema";
import { createCaptureMailer } from "../email/mailer";
import {
  addContactEmail,
  approveDraft,
  blockCompany,
  createDueFollowUps,
  createFirstDraft,
  discardDraft,
  listDrafts,
  markReplied,
} from "./drafts";
import { sendApprovedDraft, type OutreachConfig } from "./send";
import { autoSendFollowUp, inSendWindow } from "./autosend";
import { verifyUnsubscribeToken } from "./unsubscribe";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 4 });
const cfg: OutreachConfig = { enabled: true, dailyCap: 2, fromAddress: "david@inzenirji.si", appUrl: "https://crm.test", secret: "s3cret" };
const T0 = new Date("2026-10-20T08:00:00Z");
const day = (n: number) => new Date(T0.getTime() + n * 86_400_000);

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies, do_not_contact RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

async function lead(name: string, email: string | null = `info@${name.toLowerCase()}.si`) {
  const [c] = await db
    .insert(companies)
    .values({ name, city: "Celje", group: "A", website: `https://${name.toLowerCase()}.si`, websiteDomain: `${name.toLowerCase()}.si`, ratingX10: 47, reviewCount: 60 })
    .returning();
  await db.insert(deals).values({ companyId: c.id, source: "places_search", stage: "researched" });
  await db.insert(audits).values({
    companyId: c.id,
    data: {},
    issues: [
      { code: "old_year", severity: "medium", text: "V nogi strani piše letnica 2016." },
      { code: "no_structured_data", severity: "low", text: "x" },
    ],
  });
  if (email) await db.insert(contacts).values({ companyId: c.id, email, emailSource: `https://${name.toLowerCase()}.si` });
  return c;
}
const stage = async (id: string) => (await admin`select stage, next_action_at from deals where company_id = ${id}`)[0];
const draftOf = async (id: string) => (await admin`select status from drafts where id = ${id}`)[0].status as string;

describe("outreach flow", () => {
  it("draft → approve → send → follow-ups day 3 and day 8 → sequence ends", async () => {
    const c = await lead("Ana");
    const r = await createFirstDraft(db, c.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await createFirstDraft(db, c.id)).toEqual({ ok: false, reason: "EXISTS" });

    const mailer = createCaptureMailer();
    // Not approved → refused, nothing sent (ADR-004).
    expect(await sendApprovedDraft(db, r.draftId, { mailer, config: cfg, now: T0 })).toEqual({ ok: false, error: "NOT_APPROVED" });
    expect(await approveDraft(db, r.draftId, { subject: "Spletna stran za Ana", body: "Pozdravljeni,\r\n\r\nurejeno besedilo." }, T0)).toBe(true);
    expect(await sendApprovedDraft(db, r.draftId, { mailer, config: { ...cfg, enabled: false }, now: T0 })).toEqual({ ok: false, error: "LOCKED" });
    expect(mailer.sent).toHaveLength(0);

    expect(await sendApprovedDraft(db, r.draftId, { mailer, config: cfg, now: T0 })).toEqual({ ok: true });
    expect(mailer.sent).toHaveLength(1);
    const m = mailer.sent[0];
    expect(m.to).toBe("info@ana.si");
    expect(m.text).toBe("Pozdravljeni,\n\nurejeno besedilo.");
    expect(m.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const token = m.headers!["List-Unsubscribe"].match(/odjava\?t=([^>]+)>/)![1];
    expect(verifyUnsubscribeToken(token, "s3cret")).toBe("info@ana.si");
    expect((await stage(c.id)).stage).toBe("contacted");
    // Sending twice is impossible.
    expect(await sendApprovedDraft(db, r.draftId, { mailer, config: cfg, now: T0 })).toEqual({ ok: false, error: "NOT_APPROVED" });

    expect(await createDueFollowUps(db, day(2))).toBe(0);
    expect(await createDueFollowUps(db, day(3))).toBe(1);
    expect(await createDueFollowUps(db, day(3))).toBe(0);
    const f1 = (await listDrafts(db)).pending[0];
    expect(f1.kind).toBe("followup_1");
    expect(f1.subject).toBe("Re: Spletna stran za Ana");
    await approveDraft(db, f1.id, { subject: f1.subject, body: f1.body }, day(3));
    expect((await sendApprovedDraft(db, f1.id, { mailer, config: cfg, now: day(3) })).ok).toBe(true);

    expect(await createDueFollowUps(db, day(7))).toBe(0);
    expect(await createDueFollowUps(db, day(8))).toBe(1);
    const f2 = (await listDrafts(db)).pending[0];
    expect(f2.kind).toBe("followup_2");
    await approveDraft(db, f2.id, { subject: f2.subject, body: f2.body }, day(8));
    expect((await sendApprovedDraft(db, f2.id, { mailer, config: cfg, now: day(8) })).ok).toBe(true);
    expect((await stage(c.id)).next_action_at).toBeNull();
    expect(await createDueFollowUps(db, day(30))).toBe(0);
    expect((await admin`select count(*)::int n from activities where type = 'email_out'`)[0].n).toBe(3);
  });

  it("daily cap counts across drafts, also for parallel sends", async () => {
    const capture = createCaptureMailer();
    // Slow SMTP so the three sends overlap; only the lock keeps the cap.
    const mailer = { sent: capture.sent, async send(m: Parameters<typeof capture.send>[0]) { await new Promise((r) => setTimeout(r, 150)); await capture.send(m); } };
    const ids: string[] = [];
    for (const n of ["Ena", "Dva", "Tri"]) {
      const c = await lead(n);
      const r = await createFirstDraft(db, c.id);
      if (!r.ok) throw new Error(r.reason);
      await approveDraft(db, r.draftId, { subject: "s", body: "b" }, T0);
      ids.push(r.draftId);
    }
    const results = await Promise.all(ids.map((id) => sendApprovedDraft(db, id, { mailer, config: cfg, now: T0 })));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok && r.error === "CAP")).toHaveLength(1);
    expect(mailer.sent).toHaveLength(2);
    // Next day the cap resets.
    const left = ids.find((_, i) => !results[i].ok)!;
    expect((await sendApprovedDraft(db, left, { mailer, config: cfg, now: day(1) })).ok).toBe(true);
  });

  it("do-not-contact: no draft, and an approved draft is discarded at send time", async () => {
    const a = await lead("Blok");
    await addToDnc(db, { kind: "domain", value: "blok.si", reason: "odjava" });
    expect(await createFirstDraft(db, a.id)).toEqual({ ok: false, reason: "BLOCKED" });

    const b = await lead("Pozno");
    const r = await createFirstDraft(db, b.id);
    if (!r.ok) throw new Error(r.reason);
    await approveDraft(db, r.draftId, { subject: "s", body: "b" }, T0);
    await addToDnc(db, { kind: "email", value: "INFO@pozno.si", reason: "odjava" });
    const mailer = createCaptureMailer();
    expect(await sendApprovedDraft(db, r.draftId, { mailer, config: cfg, now: T0 })).toEqual({ ok: false, error: "BLOCKED" });
    expect(await draftOf(r.draftId)).toBe("discarded");
    expect(mailer.sent).toHaveLength(0);
  });

  it("failed SMTP keeps the draft approved and the deal untouched", async () => {
    const c = await lead("Napaka");
    const r = await createFirstDraft(db, c.id);
    if (!r.ok) throw new Error(r.reason);
    await approveDraft(db, r.draftId, { subject: "s", body: "b" }, T0);
    const broken = { async send() { throw new Error("smtp down"); } };
    expect(await sendApprovedDraft(db, r.draftId, { mailer: broken, config: cfg, now: T0 })).toEqual({ ok: false, error: "SEND_FAILED" });
    expect(await draftOf(r.draftId)).toBe("approved");
    expect((await stage(c.id)).stage).toBe("researched");
  });

  it("no e-mail → owner adds one with a source; replied and blocked stop everything", async () => {
    const c = await lead("Brez", null);
    expect(await createFirstDraft(db, c.id)).toEqual({ ok: false, reason: "NO_EMAIL" });
    expect((await addContactEmail(db, c.id, "x", "fb")).ok).toBe(false);
    expect((await addContactEmail(db, c.id, " Info@Brez.si ", "https://facebook.com/brez")).ok).toBe(true);
    const r = await createFirstDraft(db, c.id);
    expect(r.ok).toBe(true);

    expect(await markReplied(db, c.id, T0)).toBe(true);
    expect((await stage(c.id)).stage).toBe("replied");
    if (r.ok) expect(await draftOf(r.draftId)).toBe("discarded");

    const d = await lead("Ne");
    const r2 = await createFirstDraft(db, d.id);
    expect(await blockCompany(db, d.id, "ni zainteresiran", T0)).toBe(true);
    if (r2.ok) expect(await draftOf(r2.draftId)).toBe("discarded");
    expect((await stage(d.id)).stage).toBe("lost");
    const dnc = await admin`select kind, value from do_not_contact order by kind, value`;
    expect(dnc.map((x) => `${x.kind}:${x.value}`).sort()).toEqual([`company:${d.id}`, "domain:ne.si", "email:info@ne.si"]);
    expect(await createFirstDraft(db, d.id)).toEqual({ ok: false, reason: "WRONG_STAGE" });
    expect((await admin`select score from companies where id = ${d.id}`)[0].score).toBe(0);
  });

  it("database: one live draft per step, discarded can be redone", async () => {
    const c = await lead("Uniq");
    const r = await createFirstDraft(db, c.id);
    if (!r.ok) throw new Error(r.reason);
    const [deal] = await db.select().from(deals);
    await expect(db.insert(drafts).values({ dealId: deal.id, kind: "first", toEmail: "a@b.si", subject: "s", body: "b" })).rejects.toThrow();
    expect(await discardDraft(db, r.draftId)).toBe(true);
    expect((await createFirstDraft(db, c.id)).ok).toBe(true);
  });

  it("automatic follow-ups: off by default, weekday hours only, one per check, stop on reply or opt-out (ADR-043)", async () => {
    const a = await lead("Ana");
    const b = await lead("Bor");
    const mailer = createCaptureMailer();
    for (const c of [a, b]) {
      const r = await createFirstDraft(db, c.id);
      if (!r.ok) throw new Error("no draft");
      await approveDraft(db, r.draftId, { subject: `Spletna stran za ${c.name}`, body: "Pozdravljeni" }, T0);
      expect((await sendApprovedDraft(db, r.draftId, { mailer, config: { ...cfg, dailyCap: 10 }, now: T0 })).ok).toBe(true);
    }
    const big = { ...cfg, dailyCap: 10 };
    expect(await autoSendFollowUp(db, { enabled: false, mailer, config: big, now: day(3) })).toEqual({ status: "off" });
    // Saturday 24 Oct, 10:00 Ljubljana: outside the window.
    expect(inSendWindow(new Date("2026-10-24T08:00:00Z"))).toBe(false);
    expect(inSendWindow(new Date("2026-10-23T05:59:00Z"))).toBe(false); // Fri 07:59
    expect(inSendWindow(new Date("2026-10-23T14:59:00Z"))).toBe(true); // Fri 16:59
    expect(await autoSendFollowUp(db, { enabled: true, mailer, config: big, now: new Date("2026-10-24T08:00:00Z") })).toEqual({ status: "outside_window" });
    // Bor replied: his sequence stops.
    await markReplied(db, b.id);
    const r1 = await autoSendFollowUp(db, { enabled: true, mailer, config: big, now: day(3) });
    expect(r1.status).toBe("sent");
    expect(mailer.sent.at(-1)).toMatchObject({ to: "info@ana.si", subject: "Re: Spletna stran za Ana" });
    expect(await autoSendFollowUp(db, { enabled: true, mailer, config: big, now: day(3) })).toEqual({ status: "nothing" });
    // Ana opts out before day 8: the follow-up is not sent.
    await addToDnc(db, { kind: "email", value: "info@ana.si", reason: "odjava" });
    const before = mailer.sent.length;
    const r2 = await autoSendFollowUp(db, { enabled: true, mailer, config: big, now: day(8) });
    expect(r2.status === "nothing" || r2.error === "BLOCKED").toBe(true);
    expect(mailer.sent.length).toBe(before);
    // A first e-mail is never sent automatically.
    const c = await lead("Cene");
    await createFirstDraft(db, c.id);
    expect(await autoSendFollowUp(db, { enabled: true, mailer, config: big, now: day(9) })).toEqual({ status: "nothing" });
  });

  it("the Ne kontaktiraj list shows entries newest first with their company, and searches", async () => {
    const a = await lead("Ana");
    await addToDnc(db, { kind: "email", value: "info@ana.si", reason: "odjava (povezava v e-mailu)" });
    await addToDnc(db, { kind: "domain", value: "https://www.bor.si/", reason: "prosil po telefonu" });
    await blockCompany(db, a.id, "ni zainteresiran");
    const all = await listDnc(db);
    expect(all.map((r) => [r.kind, r.value, r.companyName])).toEqual([
      ["domain", "ana.si", "Ana"],
      ["company", a.id, "Ana"],
      ["domain", "bor.si", null],
      ["email", "info@ana.si", "Ana"],
    ]);
    expect((await listDnc(db, "telefon")).map((r) => r.value)).toEqual(["bor.si"]);
  });

  it("first e-mail written by AI when it passes the checks; template after two failures (ADR-045)", async () => {
    const good = JSON.stringify({
      subject: "Spletna stran za Ano",
      body: "Pozdravljeni,\n\nna Googlu vas 60 strank ocenjuje s 4,7, v nogi vaše strani pa je še letnica 2016.\n\nSem David iz inženirji.si. Vašo vsebino prenesemo na našo platformo, da se stran na telefonu odpre v trenutku in jo najdejo tudi Google in ChatGPT.\n\nPotem jo urejate sami, kar preko klepeta: napišete, kaj želite spremeniti, ali pošljete sliko, AI pa to uredi v nekaj sekundah. Preizkusite tukaj: https://www.inzenirji.si/demo\n\nVas zanima? Na kratko mi odpišite, pa se za 15 minut slišiva po telefonu.",
    });
    let calls = 0;
    const answer = (text: string) =>
      (async () => {
        calls++;
        return Response.json({ content: [{ type: "text", text }], usage: { input_tokens: 1500, output_tokens: 300 } });
      }) as unknown as typeof fetch;
    const ai = { apiKey: "k", model: "claude-sonnet-5-5", dailyBudgetMicroUsd: 5_000_000 };
    const a = await lead("Ana");
    const r = await createFirstDraft(db, a.id, { ...ai, fetchImpl: answer(good) });
    if (!r.ok) throw new Error(r.reason);
    const [d] = await admin`select subject, body from drafts where id = ${r.draftId}`;
    expect(d.subject).toBe("Spletna stran za Ano");
    expect(d.body).toContain("na Googlu vas 60 strank");
    expect(d.body.endsWith("P.S. Če vas to ne zanima, mi samo odpišite »ne« in vam ne bom več pisal.")).toBe(true);
    expect(calls).toBe(1);
    // Bad text twice (competitor + no price) → template; both attempts logged.
    const b = await lead("Bor");
    calls = 0;
    const bad = JSON.stringify({ subject: "x", body: "Pozdravljeni,\n\nkonkurenca ima stran." });
    const rb = await createFirstDraft(db, b.id, { ...ai, fetchImpl: answer(bad) });
    if (!rb.ok) throw new Error(rb.reason);
    expect(calls).toBeGreaterThanOrEqual(2);
    const [db2] = await admin`select body from drafts where id = ${rb.draftId}`;
    expect(db2.body).toContain("Sem David iz ekipe inženirji.si");
    expect((await admin`select job, ok from ai_usage where job = 'first_email' order by created_at`).map((x) => x.ok)).toEqual([true, false, false]);
  });
});
