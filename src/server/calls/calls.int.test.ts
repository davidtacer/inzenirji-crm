import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { audits, companies, deals, drafts } from "../db/schema";
import { callNotesHistory, callsBoard, prepareBrief, saveCallNotes, setStage } from "./calls";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });
const T0 = new Date("2026-10-20T08:00:00Z");

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies, ai_usage RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

async function lead(stage: "contacted" | "replied" = "replied") {
  const [c] = await db.insert(companies).values({ name: "Salon Ana", city: "Celje", category: "Frizer", group: "B", ratingX10: 48, reviewCount: 90 }).returning();
  const [d] = await db.insert(deals).values({ companyId: c.id, source: "places_search", stage }).returning();
  await db.insert(audits).values({ companyId: c.id, data: { google: { summary: "Prijazen salon." } }, issues: [{ code: "social_only", severity: "high", text: "Ima samo Facebook." }] });
  return { c, d };
}
const ai = (text: string) => ({
  apiKey: "K",
  model: "claude-sonnet-5-5",
  dailyBudgetMicroUsd: 1e6,
  fetchImpl: (async () => new Response(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 800, output_tokens: 300 } }), { status: 200 })) as unknown as typeof fetch,
});

describe("calls", () => {
  it("stage changes: booked needs a time, lost needs a reason; open follow-ups are discarded; board groups them", async () => {
    const { c, d } = await lead("contacted");
    await db.insert(drafts).values({ dealId: d.id, kind: "followup_1", toEmail: "a@b.si", subject: "s", body: "b" });
    expect(await setStage(db, c.id, { stage: "call_booked" }, T0)).toMatch(/datum in uro/);
    const at = new Date("2026-10-21T12:30:00Z");
    expect(await setStage(db, c.id, { stage: "call_booked", callAt: at }, T0)).toBeNull();
    expect((await admin`select stage, call_at, next_action_at from deals`)[0]).toEqual({ stage: "call_booked", call_at: at, next_action_at: at });
    expect((await admin`select status from drafts`)[0].status).toBe("discarded");
    expect((await admin`select type from activities`)[0].type).toBe("booking");
    expect((await callsBoard(db)).booked.map((b) => b.name)).toEqual(["Salon Ana"]);
    expect(await setStage(db, c.id, { stage: "lost", lostReason: " " }, T0)).toMatch(/razlog/);
    expect(await setStage(db, c.id, { stage: "lost", lostReason: "predrago" }, T0)).toBeNull();
    expect((await admin`select lost_reason, call_at from deals`)[0]).toEqual({ lost_reason: "predrago", call_at: at });
  });

  it("brief: AI JSON stored; rules when AI is off or answers badly", async () => {
    const { c } = await lead();
    const good = await prepareBrief(db, c.id, ai('{"business":"Frizerski salon v Celju, odlične ocene.","problems":["Samo Facebook"],"competitors":"Dva soseda imata stran.","objections":["Predrago (590 € + DDV, garancija)"],"offer":"Nova stran B.","questions":["Kdo ureja Facebook?"]}'), T0);
    expect(good).toMatchObject({ source: "ai", business: "Frizerski salon v Celju, odlične ocene.", problems: ["Samo Facebook"] });
    expect((await admin`select brief->>'source' as s, brief_at from deals`)[0]).toEqual({ s: "ai", brief_at: T0 });
    const bad = await prepareBrief(db, c.id, ai("Seveda, tukaj je brief!"), T0);
    expect(bad).toMatchObject({ source: "rules", problems: ["Ima samo Facebook."] });
    expect(bad?.offer).toContain("590 €");
    expect((await prepareBrief(db, c.id, null, T0))?.source).toBe("rules");
    expect((await admin`select ok from ai_usage order by created_at`).map((r) => r.ok)).toEqual([true, false]);
  });

  it("call notes: AI summary with package and materials, stage call_done, history kept; without AI the notes themselves", async () => {
    const { c } = await lead();
    expect(await saveCallNotes(db, c.id, "kratko", null, T0)).toEqual({ ok: false, message: "Zapiski so prekratki." });
    const r = await saveCallNotes(
      db,
      c.id,
      "Ana želi 4 podstrani, cenik, galerijo, rezervacije prek telefona. Skrbi jo cena. Pošljem ponudbo do petka.",
      ai('{"summary":"Želi novo stran s 4 podstranmi.","scope":"4 podstrani, cenik, galerija","wishes":["galerija"],"objections":["cena"],"nextStep":"ponudba do petka","package":"B","materials":["Logotip","Fotografije"]}'),
      T0,
    );
    expect(r).toMatchObject({ ok: true, summary: { source: "ai", package: "B", nextStep: "ponudba do petka", materials: ["Logotip", "Fotografije"] } });
    expect((await admin`select stage, call_summary->>'scope' as scope from deals`)[0]).toEqual({ stage: "call_done", scope: "4 podstrani, cenik, galerija" });
    const r2 = await saveCallNotes(db, c.id, "Drugi klic: potrdila naročilo, pošlje slike.", null, T0);
    expect(r2).toMatchObject({ ok: true, summary: { source: "notes", summary: "Drugi klic: potrdila naročilo, pošlje slike." } });
    expect(await callNotesHistory(db, c.id)).toHaveLength(2);
    expect((await callsBoard(db)).done).toHaveLength(1);
  });
});
