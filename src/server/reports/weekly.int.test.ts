import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { calendarEvents, companies, deals, doNotContact, drafts, inboundMessages, projects, proposals, weeklyReports } from "../db/schema";
import { createCaptureMailer } from "../email/mailer";
import { tick } from "./schedule";
import { collectWeek, dueWeek, isDue, makeReport, ruleSuggestions, weekBounds, weekLabel, weekStartOf } from "./weekly";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies, weekly_reports, ai_usage, do_not_contact, calendar_events RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

// Week of Monday 12 Oct 2026 (CEST, UTC+2): 2026-10-11T22:00Z .. 2026-10-18T22:00Z.
const WS = "2026-10-12";
const at = (s: string) => new Date(s);

async function lead(name: string, source: "places_search" | "editor_demo", createdAt: string, category = "Frizerski salon", group: "A" | "B" = "B") {
  const [c] = await db.insert(companies).values({ name, category, group }).returning();
  const [d] = await db.insert(deals).values({ companyId: c.id, source, createdAt: at(createdAt) }).returning();
  return { c, d };
}

describe("weekly report (TASK-016)", () => {
  it("weeks are Monday to Monday in Ljubljana time, DST included", () => {
    expect(weekStartOf(at("2026-10-12T00:30:00+02:00"))).toBe("2026-10-12");
    expect(weekStartOf(at("2026-10-11T23:30:00+02:00"))).toBe("2026-10-05");
    expect(weekStartOf(at("2026-10-18T23:59:00+02:00"))).toBe("2026-10-12");
    expect(weekBounds(WS)).toEqual({ from: at("2026-10-11T22:00:00Z"), to: at("2026-10-18T22:00:00Z") });
    // Week with the switch to winter time (25 Oct 2026).
    expect(weekBounds("2026-10-19").to).toEqual(at("2026-10-25T23:00:00Z"));
    expect(weekLabel(WS)).toBe("12. 10. - 18. 10. 2026");
    expect(isDue(at("2026-10-19T07:59:00+02:00"))).toBe(false);
    expect(isDue(at("2026-10-19T08:00:00+02:00"))).toBe(true);
    expect(dueWeek(at("2026-10-19T08:00:00+02:00"))).toBe(WS);
  });

  it("counts the week from CRM data", async () => {
    const a = await lead("Salon A", "places_search", "2026-10-13T09:00:00+02:00");
    const b = await lead("Salon B", "places_search", "2026-10-13T09:05:00+02:00");
    const old = await lead("Stari", "places_search", "2026-10-01T09:00:00+02:00", "Avtomehanik", "A");
    const demo = await lead("Demo d.o.o.", "editor_demo", "2026-10-14T10:00:00+02:00");
    for (const x of [a, b, old]) {
      await db.insert(drafts).values({ dealId: x.d.id, toEmail: `info@${x.c.name.replace(/\W/g, "").toLowerCase()}.si`, subject: "s", body: "b", kind: "first", status: "sent", approvedAt: at("2026-10-13T10:00:00+02:00"), sentAt: at("2026-10-13T10:00:00+02:00") });
    }
    await db.insert(drafts).values({ dealId: old.d.id, toEmail: "x@y.si", subject: "s", body: "b", kind: "followup_1", status: "sent", approvedAt: at("2026-10-16T10:00:00+02:00"), sentAt: at("2026-10-16T10:00:00+02:00") });
    // Salon A replies interested at 12:00; we answer at 12:30 from the mailbox.
    await db.insert(inboundMessages).values({ messageId: "<r1@a>", companyId: a.c.id, dealId: a.d.id, fromEmail: "a@a.si", subject: "Re", receivedAt: at("2026-10-13T12:00:00+02:00"), classification: "interested", classifiedBy: "rule" });
    await db.insert(inboundMessages).values({ messageId: "<o1@a>", companyId: a.c.id, dealId: a.d.id, direction: "out", fromEmail: "david@inzenirji.si", subject: "Re", receivedAt: at("2026-10-13T12:30:00+02:00"), classifiedBy: "mailbox" });
    await db.insert(inboundMessages).values({ messageId: "<r2@b>", companyId: b.c.id, dealId: b.d.id, fromEmail: "b@b.si", subject: "Re", receivedAt: at("2026-10-14T08:00:00+02:00"), classification: "out_of_office", classifiedBy: "rule" });
    await db.insert(doNotContact).values({ kind: "email", value: "no@x.si", reason: "ne", createdAt: at("2026-10-15T08:00:00+02:00") });
    await db.insert(calendarEvents).values({ eventId: "e1", summary: "Klic", startAt: at("2026-10-15T10:00:00+02:00"), status: "confirmed", companyId: a.c.id });
    await db.insert(calendarEvents).values({ eventId: "e2", summary: "Odpovedan", startAt: at("2026-10-15T11:00:00+02:00"), status: "cancelled", companyId: b.c.id });
    await db.update(deals).set({ callAt: at("2026-10-15T10:00:00+02:00") }).where(eq(deals.id, a.d.id));
    const [p] = await db
      .insert(proposals)
      .values({ dealId: a.d.id, token: "t1", title: "Nova stran", items: [{ label: "Stran", priceCents: 59000 }], validUntil: "2026-11-01", status: "accepted", sentAt: at("2026-10-15T15:00:00+02:00"), acceptedAt: at("2026-10-16T09:00:00+02:00"), acceptedName: "Ana" })
      .returning();
    await db.insert(projects).values({ dealId: a.d.id, proposalId: p.id, token: "pt1", depositCents: 35990, depositPaidAt: at("2026-10-16T12:00:00+02:00") });

    const d = await collectWeek(db, WS, { now: at("2026-10-19T08:00:00+02:00") });
    expect(d).toMatchObject({
      partial: false,
      leads: 3,
      outreach: { first: 3, followups: 1, replies: 1, interested: 1, no: 0, bounces: 0, optOuts: 1 },
      calls: 1,
      proposals: { sent: 1, accepted: 1, acceptedNetCents: 59000 },
      paid: { count: 1, cents: 35990 },
      monthSales: 1,
      monthLabel: "oktober",
      replyHoursMedian: 0.5,
      demo: { leads: 1, stats: null },
    });
    expect(d.channels).toEqual([
      { source: "places_search", leads: 2, contacted: 3, replies: 1, calls: 1, proposals: 1, won: 1 },
      { source: "editor_demo", leads: 1, contacted: 0, replies: 0, calls: 0, proposals: 0, won: 0 },
    ]);
    expect(d.worked.categories).toEqual([{ label: "Frizerski salon", sent: 2, replies: 1 }, { label: "Avtomehanik", sent: 1, replies: 0 }]);
    expect(d.worked.groups).toEqual([{ label: "A", sent: 1, replies: 0 }, { label: "B", sent: 2, replies: 1 }]);
    void demo;

    const s = ruleSuggestions(d);
    expect(s).toHaveLength(3);
    expect(s[0]).toBe("Dodaj vsaj 27 novih podjetij v Iskanju strank.");
    expect(s[1]).toMatch(/Pošlji več prvih e-mailov: ta teden 3/);
  });

  it("makes, stores and e-mails the report once (AI suggestions, then no second send)", async () => {
    await lead("Salon A", "places_search", "2026-10-13T09:00:00+02:00");
    const mailer = createCaptureMailer();
    const aiFetch = (async () =>
      Response.json({ content: [{ type: "text", text: '{"suggestions": ["Pošlji 30 e-mailov frizerjem.", "Pokliči Salon A.", "Dodaj 20 podjetij — v Celju."]}' }], usage: { input_tokens: 900, output_tokens: 80 } })) as unknown as typeof fetch;
    const deps = async () => ({ ai: { apiKey: "k", model: "claude-sonnet-5-5", dailyBudgetMicroUsd: 5_000_000, fetchImpl: aiFetch }, mailer, to: "dtacer@gmail.com", appUrl: "https://crm.inzenirji.si" });

    expect(await tick(db, at("2026-10-19T07:50:00+02:00"), deps)).toBe("not_due");
    expect(await tick(db, at("2026-10-19T08:05:00+02:00"), deps)).toBe("sent");
    expect(await tick(db, at("2026-10-19T08:15:00+02:00"), deps)).toBe("already_sent");
    expect(mailer.sent).toHaveLength(1);
    const m = mailer.sent[0];
    expect(m.to).toBe("dtacer@gmail.com");
    expect(m.subject).toBe("Tedensko poročilo 12. 10. - 18. 10. 2026: 0 klicev, 0 prodaj");
    expect(m.text).toContain("Novi leadi: 1 (+1) / cilj 30");
    expect(m.text).toContain("3. Dodaj 20 podjetij - v Celju.");
    expect(m.text).toContain("https://crm.inzenirji.si/porocila?w=2026-10-12");
    expect(m.html).toContain("<ol><li>Pošlji 30 e-mailov frizerjem.</li>");
    const [row] = await db.select().from(weeklyReports);
    expect(row).toMatchObject({ weekStart: WS, suggestionsBy: "claude-sonnet-5-5", sendError: null });
    expect((await admin`select job from ai_usage`).map((r) => r.job)).toEqual(["weekly_report"]);
  });

  it("without AI uses rules; a failed send is kept with the reason and retried later", async () => {
    const broken = { send: async () => { throw new Error("SMTP down"); } };
    const r = await makeReport(db, WS, { ai: null, mailer: broken, to: "dtacer@gmail.com", appUrl: "x", now: at("2026-10-19T08:00:00+02:00") });
    expect(r).toMatchObject({ suggestionsBy: "rules", sentAt: null, sendError: "SMTP down" });
    expect(r.suggestions).toHaveLength(3);
    const deps = async () => ({ ai: null, mailer: createCaptureMailer(), to: "d@x.si", appUrl: "x" });
    expect(await tick(db, at("2026-10-19T08:30:00+02:00"), deps)).toBe("failed"); // waits an hour
    expect(await tick(db, at("2026-10-19T09:10:00+02:00"), deps)).toBe("sent");
  });
});

import { eq } from "drizzle-orm";
