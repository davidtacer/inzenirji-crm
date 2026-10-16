import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { companies, contacts, deals, proposals } from "../db/schema";
import { createCaptureMailer } from "../email/mailer";
import { approveDraft, listDrafts } from "../outreach/drafts";
import { sendApprovedDraft } from "../outreach/send";
import { defaultSettings } from "../settings";
import { confirmationEmail, deleteFile, getProject, materialsEmail, pauseProject, projectByToken, resumeProject, startProject, submitItem } from "./projects";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });
const NOW = new Date("2026-10-20T10:00:00Z");
const dir = mkdtempSync(path.join(tmpdir(), "uploads-"));

beforeAll(async () => {
  process.env.UPLOAD_DIR = dir;
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  delete process.env.UPLOAD_DIR;
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

async function accepted() {
  const [c] = await db.insert(companies).values({ name: "Salon Ana" }).returning();
  const [d] = await db.insert(deals).values({ companyId: c.id, source: "manual", stage: "proposal_sent" }).returning();
  await db.insert(contacts).values({ companyId: c.id, email: "ana@gmail.com", emailSource: "x" });
  await db.insert(proposals).values({
    dealId: d.id,
    token: "t".repeat(24),
    status: "accepted",
    title: "P",
    items: [{ label: "Stran", priceCents: 59_000 }],
    materials: ["Logotip", "Besedila za stran"],
    validUntil: "2026-11-01",
    acceptedAt: NOW,
    acceptedName: "Ana",
    timelineDays: 7,
  });
  return c;
}
const png = (n = 10) => ({ name: "logo.png", type: "image/png", size: n, data: Buffer.alloc(n, 1) });

describe("projects", () => {
  it("prepayment → won + project with materials and deposit; client uploads; confirmation e-mail sent starts the clock", async () => {
    const c = await accepted();
    const st = defaultSettings({});
    const r = await startProject(db, c.id, st, NOW);
    if (!r.ok) throw new Error(r.message);
    expect(await startProject(db, c.id, st, NOW)).toEqual(r);
    expect((await admin`select stage from deals`)[0].stage).toBe("won");
    const p = (await getProject(db, r.id))!;
    expect(p.p).toMatchObject({ status: "materials", depositCents: 35_990, timelineDays: 7 });
    expect((p.p.materials as { label: string; done: boolean }[]).map((m) => [m.label, m.done])).toEqual([["Logotip", false], ["Besedila za stran", false]]);

    expect((await materialsEmail(db, r.id)).ok).toBe(true);
    expect((await listDrafts(db)).pending[0].body).toContain(`/projekt/${p.p.token}`);
    await admin`update drafts set status = 'discarded'`;

    expect(await submitItem(db, p.p.token, 0, { text: "", files: [{ ...png(), type: "application/x-msdownload", name: "x.exe" }] }, NOW)).toMatch(/ni podprta/);
    expect(await submitItem(db, p.p.token, 0, { text: "", files: [png()] }, NOW)).toBeNull();
    expect(await submitItem(db, p.p.token, 1, { text: "O nas: družinski salon od 1998.", files: [] }, NOW)).toBeNull();
    expect(await submitItem(db, p.p.token, 5, { text: "x", files: [] }, NOW)).toMatch(/Neveljavna/);
    const after = (await projectByToken(db, p.p.token))!;
    expect((after.p.materials as { done: boolean }[]).every((m) => m.done)).toBe(true);
    expect(after.files).toHaveLength(1);
    expect(readdirSync(path.join(dir, r.id))).toHaveLength(1);

    // Removing the only file of an item makes it missing again.
    expect(await deleteFile(db, p.p.token, after.files[0].id)).toBeNull();
    expect(((await getProject(db, r.id))!.p.materials as { done: boolean }[])[0].done).toBe(false);
    await submitItem(db, p.p.token, 0, { text: "", files: [png(20)] }, NOW);

    expect((await confirmationEmail(db, r.id, NOW)).ok).toBe(true);
    const d = (await listDrafts(db)).pending[0];
    expect(d.body).toContain("27. 10. 2026");
    await approveDraft(db, d.id, { subject: d.subject, body: d.body }, NOW);
    const cfg = { enabled: true, dailyCap: 10, fromAddress: "david@inzenirji.si", appUrl: "https://x", secret: "s" };
    expect(await sendApprovedDraft(db, d.id, { mailer: createCaptureMailer(), config: cfg, now: NOW })).toEqual({ ok: true });
    const running = (await getProject(db, r.id))!;
    expect(running.p).toMatchObject({ status: "in_progress", confirmedAt: NOW });
    expect(await submitItem(db, p.p.token, 0, { text: "x", files: [] }, NOW)).toMatch(/že potrjeni/);

    expect(await pauseProject(db, r.id, "x", NOW)).toMatch(/razlog/);
    expect(await pauseProject(db, r.id, "čakam besedila", new Date("2026-10-21T10:00:00Z"))).toBeNull();
    expect(await pauseProject(db, r.id, "še enkrat", new Date("2026-10-21T11:00:00Z"))).toMatch(/že ustavljen/);
    await resumeProject(db, r.id, new Date("2026-10-23T10:00:00Z"));
    const g = (await getProject(db, r.id))!;
    expect(g.clock.deadline).toEqual(new Date("2026-10-29T10:00:00Z"));
  });
});
