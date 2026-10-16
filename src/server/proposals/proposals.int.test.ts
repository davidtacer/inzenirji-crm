import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { companies, contacts, deals, inboundMessages } from "../db/schema";
import { defaultSettings } from "../settings";
import { setStage } from "../calls/calls";
import { acceptProposal, createProposal, openProposal, proposalEmail, updateProposal } from "./proposals";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });
const NOW = new Date("2026-10-16T10:00:00Z");
const seller = { ...defaultSettings({}), sellerName: "David Tacer s.p.", sellerStreet: "Ulica 1", sellerCity: "2000 Maribor", iban: "SI56263300012039086" };

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

async function afterCall(pkg: "A" | "B") {
  const [c] = await db.insert(companies).values({ name: "Salon Ana", group: pkg }).returning();
  const [d] = await db
    .insert(deals)
    .values({ companyId: c.id, source: "manual", stage: "call_done", callSummary: { source: "ai", summary: "s", scope: "4 podstrani, galerija", wishes: [], objections: [], nextStep: "", package: pkg, materials: ["Logotip", "Fotografije"] } })
    .returning();
  await db.insert(contacts).values({ companyId: c.id, email: "info@ana.si", emailSource: "x" });
  await db.insert(inboundMessages).values({ messageId: "<m1@ana.si>", companyId: c.id, dealId: d.id, fromEmail: "info@ana.si", subject: "Re: Spletna stran", receivedAt: NOW, classification: "interested", classifiedBy: "rule" });
  return { c, d };
}

describe("proposals", () => {
  it("B: from the call summary, e-mailed as a threaded reply draft, stage proposal_sent; views counted; accepted; paid → won", async () => {
    const { c } = await afterCall("B");
    const p = (await createProposal(db, c.id, seller, NOW))!;
    expect(p).toMatchObject({ status: "draft", items: [{ priceCents: 59_000 }], materials: ["Logotip", "Fotografije"], validUntil: "2026-10-30" });
    expect(p.intro).toContain("4 podstrani, galerija");
    expect((await createProposal(db, c.id, seller, NOW))!.id).toBe(p.id);

    expect(await openProposal(db, p.token, { owner: false })).toBeNull(); // drafts are not public
    expect(await openProposal(db, p.token, { owner: true })).not.toBeNull();

    expect(await proposalEmail(db, p.id, defaultSettings({}), NOW)).toMatchObject({ ok: false, message: expect.stringMatching(/Nastavitvah/) });
    // The owner already answered that message (sent reply): the proposal e-mail must still be possible.
    const [deal] = await db.select().from(deals);
    await admin`insert into drafts (deal_id, kind, to_email, subject, body, status, approved_at, sent_at, in_reply_to) values (${deal.id}, 'reply', 'info@ana.si', 's', 'b', 'sent', now(), now(), '<m1@ana.si>')`;
    const r = await proposalEmail(db, p.id, seller, NOW);
    expect(r.ok).toBe(true);
    const [dr] = await admin`select kind, to_email, subject, in_reply_to, body from drafts where status = 'pending'`;
    expect(dr).toMatchObject({ kind: "reply", to_email: "info@ana.si", subject: "Re: Spletna stran", in_reply_to: "<m1@ana.si>" });
    expect(dr.body).toContain(`/ponudba/${p.token}`);
    expect(dr.body).toContain("719,80 €");
    expect((await admin`select stage from deals`)[0].stage).toBe("proposal_sent");

    await openProposal(db, p.token, { owner: false, now: NOW });
    await openProposal(db, p.token, { owner: false, now: NOW });
    await openProposal(db, p.token, { owner: true });
    expect((await admin`select view_count from proposals`)[0].view_count).toBe(2);

    expect(await acceptProposal(db, p.token, "A", NOW)).toMatch(/ime/);
    expect(await acceptProposal(db, p.token, "Ana Novak", NOW)).toBeNull();
    expect((await admin`select status, accepted_name from proposals`)[0]).toEqual({ status: "accepted", accepted_name: "Ana Novak" });
    expect(await updateProposal(db, p.id, { title: "x", intro: "", items: "a | 1", timelineDays: "7", depositPct: "50", materials: "", validUntil: "2026-10-30" })).toMatch(/Sprejete/);
    expect(await setStage(db, c.id, { stage: "won" })).toBeNull();
  });

  it("A: price must be filled in before e-mailing; edit validates; expired proposals cannot be accepted", async () => {
    const { c } = await afterCall("A");
    const p = (await createProposal(db, c.id, seller, NOW))!;
    expect(p.items).toEqual([{ label: expect.stringContaining("Prenos"), priceCents: 0 }]);
    expect(await proposalEmail(db, p.id, seller, NOW)).toMatchObject({ ok: false, message: expect.stringMatching(/ceno/) });
    expect(await updateProposal(db, p.id, { title: "Ponudba", intro: "", items: "Prenos | ", timelineDays: "7", depositPct: "50", materials: "", validUntil: "2026-10-30" })).toMatch(/ceno/);
    expect(await updateProposal(db, p.id, { title: "Ponudba", intro: "", items: "Prenos | 900", timelineDays: "10", depositPct: "50", materials: "Logotip\n\nDostop", validUntil: "2026-10-20" })).toBeNull();
    expect((await proposalEmail(db, p.id, seller, NOW)).ok).toBe(true);
    expect(await acceptProposal(db, p.token, "Ana Novak", new Date("2026-10-25T10:00:00Z"))).toMatch(/potekla/);
  });
});
