import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { audits, companies, contacts, deals } from "../db/schema";
import { createFirstDraft, listDrafts } from "../outreach/drafts";
import { ensureAiRemark, type AiConfig } from "./remark";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });

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

const answer = (text: string, status = 200) => {
  const calls: string[] = [];
  const fetchImpl = (async (_u: string, init: RequestInit) => {
    calls.push(String(init.body));
    return new Response(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 2000, output_tokens: 80 } }), { status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
};

async function lead() {
  const [c] = await db.insert(companies).values({ name: "Salon Ana", city: "Celje", group: "B", websiteDomain: "facebook.com", ratingX10: 48, reviewCount: 90 }).returning();
  await db.insert(deals).values({ companyId: c.id, source: "places_search", stage: "researched" });
  await db.insert(audits).values({
    companyId: c.id,
    data: { google: { summary: "Prijazen salon.", reviews: [{ rating: 5, text: "Najboljše barvanje v Celju!" }] } },
    issues: [{ code: "social_only", severity: "high", text: "Ima samo Facebook." }],
  });
  await db.insert(contacts).values({ companyId: c.id, email: "ana@gmail.com", emailSource: "https://bizi.si/x" });
  return c;
}

describe("AI remark", () => {
  it("generated once per audit, stored, cost recorded, used in the draft", async () => {
    const c = await lead();
    const { calls, fetchImpl } = answer('{"remark": "imate samo Facebook profil - stranke pa hvalijo vaše barvanje", "basis": "mnenja"}');
    const cfg: AiConfig = { apiKey: "K", model: "claude-sonnet-5-5", dailyBudgetMicroUsd: 1_000_000, fetchImpl };
    const r = await createFirstDraft(db, c.id, cfg);
    expect(r.ok).toBe(true);
    const d = (await listDrafts(db)).pending[0];
    expect(d.body).toContain("opazil sem, da imate samo Facebook profil - stranke pa hvalijo vaše barvanje.");
    expect(calls[0]).toContain("Najboljše barvanje v Celju!");
    expect(await ensureAiRemark(db, c.id, cfg)).toMatchObject({ remark: "imate samo Facebook profil - stranke pa hvalijo vaše barvanje" });
    expect(calls).toHaveLength(1);
    const [u] = await admin`select job, model, input_tokens, output_tokens, cost_micro_usd, ok from ai_usage`;
    expect(u).toEqual({ job: "remark", model: "claude-sonnet-5-5", input_tokens: 2000, output_tokens: 80, cost_micro_usd: 4800, ok: true });
  });

  it("bad answer, API error or budget used up → rules, nothing stored", async () => {
    const c = await lead();
    const bad = answer("Seveda! Tukaj je opazka.");
    expect(await ensureAiRemark(db, c.id, { apiKey: "K", model: "claude-sonnet-5-5", dailyBudgetMicroUsd: 1_000_000, fetchImpl: bad.fetchImpl })).toBeNull();
    expect((await admin`select ok from ai_usage`)[0].ok).toBe(false);

    const err = answer("", 529);
    expect(await ensureAiRemark(db, c.id, { apiKey: "K", model: "claude-sonnet-5-5", dailyBudgetMicroUsd: 1_000_000, fetchImpl: err.fetchImpl })).toBeNull();

    const good = answer('{"remark": "imate samo Facebook profil, brez prave spletne strani", "basis": "x"}');
    expect(await ensureAiRemark(db, c.id, { apiKey: "K", model: "claude-sonnet-5-5", dailyBudgetMicroUsd: 4800, fetchImpl: good.fetchImpl })).toBeNull();
    expect(good.calls).toHaveLength(0);

    const r = await createFirstDraft(db, c.id, null);
    expect(r.ok).toBe(true);
    expect((await listDrafts(db)).pending[0].body).toContain("opazil sem, da se predstavljate samo na Facebooku");
  });
});
