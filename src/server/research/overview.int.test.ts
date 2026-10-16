import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { companies, deals } from "../db/schema";
import { geminiConfig, geminiStatus, saveGemini, usesThinkingLevel } from "../google/gemini";
import { latestOverview, linkKind, mentioned, runOverview } from "./overview";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-gemini-0123456789";

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies, settings, ai_usage RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

const ANSWER = `- Facebook: https://www.facebook.com/people/Frizerski-salon-Pri-Slavici/100063486733971/ (262 sledilcev)
- E-naslov: tjasamogu@gmail.com (vir: Facebook, O nas)
- Imenik: https://www.bizi.si/TJASA-MOGU-S-P/.`;

describe("Google pregled (TASK-037)", () => {
  it("key stored encrypted, model default, status", async () => {
    expect(await geminiStatus(db)).toEqual({ set: false, model: "gemini-flash-latest" });
    await saveGemini(db, { apiKey: "AIzaSyTESTKEY0123456789abcdefghij" });
    const [row] = await admin`select value from settings where key = 'gemini'`;
    expect(JSON.stringify(row.value)).not.toContain("AIzaSyTESTKEY");
    expect(await geminiConfig(db)).toEqual({ apiKey: "AIzaSyTESTKEY0123456789abcdefghij", model: "gemini-flash-latest" });
    await saveGemini(db, { model: "gemini-3.5-flash" });
    expect(await geminiConfig(db)).toMatchObject({ apiKey: "AIzaSyTESTKEY0123456789abcdefghij", model: "gemini-3.5-flash" });
  });

  it("runs, stores the grounded answer as a note with Search Suggestions, logs usage", async () => {
    const [c] = await db.insert(companies).values({ name: "Frizerski salon pri Slavici, Tjaša Mogu s.p.", city: "Celje", phone: "(03) 547 20 56" }).returning();
    await db.insert(deals).values({ companyId: c.id, source: "places_search" });
    expect(await runOverview(db, c.id)).toMatch(/ključ za Gemini/);
    await saveGemini(db, { apiKey: "AIzaSyTESTKEY0123456789abcdefghij" });
    let sent: { url: string; body: Record<string, unknown>; key: string } | null = null;
    const fetchImpl = (async (u: string, init: RequestInit) => {
      sent = { url: u, body: JSON.parse(String(init.body)), key: (init.headers as Record<string, string>)["x-goog-api-key"] };
      return Response.json({
        candidates: [
          {
            content: { parts: [{ text: ANSWER }] },
            groundingMetadata: {
              webSearchQueries: ["Frizerski salon Pri Slavici Celje", "Pri Slavici facebook"],
              searchEntryPoint: { renderedContent: "<div class='chips'>…</div>" },
              groundingChunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/x", title: "facebook.com" } }],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 200 },
      });
    }) as unknown as typeof fetch;
    expect(await runOverview(db, c.id, fetchImpl)).toBe("Google pregled je pripravljen.");
    expect(sent!.url).toContain("/models/gemini-flash-latest:generateContent");
    expect(sent!.key).toBe("AIzaSyTESTKEY0123456789abcdefghij");
    expect(sent!.body.tools).toEqual([{ google_search: {} }]);
    expect(sent!.body.generationConfig).toEqual({ thinkingConfig: { thinkingLevel: "low" } });
    const o = (await latestOverview(db, c.id))!;
    expect(o).toMatchObject({ text: ANSWER, searchHtml: "<div class='chips'>…</div>", queries: ["Frizerski salon Pri Slavici Celje", "Pri Slavici facebook"] });
    expect((await admin`select job, cost_micro_usd from ai_usage`)[0]).toEqual({ job: "google_overview", cost_micro_usd: 28000 });
  });

  it("explains failures", async () => {
    const [c] = await db.insert(companies).values({ name: "X" }).returning();
    await db.insert(deals).values({ companyId: c.id, source: "places_search" });
    await saveGemini(db, { apiKey: "AIzaSyTESTKEY0123456789abcdefghij", model: "gemini-nope" });
    const nf = (async () => Response.json({ error: { status: "NOT_FOUND", message: "model not found" } }, { status: 404 })) as unknown as typeof fetch;
    expect(await runOverview(db, c.id, nf)).toMatch(/gemini-nope ne obstaja/);
    const bad = (async () => Response.json({ error: { status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." } }, { status: 400 })) as unknown as typeof fetch;
    expect(await runOverview(db, c.id, bad)).toMatch(/ni veljaven/);
    const unauth = (async () => Response.json({ error: { status: "UNAUTHENTICATED", message: "ACCESS_TOKEN_TYPE_UNSUPPORTED" } }, { status: 401 })) as unknown as typeof fetch;
    expect(await runOverview(db, c.id, unauth)).toMatch(/ni sprejel ključa.*401/);
    const quota = (async () => Response.json({ error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }, { status: 429 })) as unknown as typeof fetch;
    expect(await runOverview(db, c.id, quota)).toMatch(/Set up billing/);
  });

  it("retries without thinkingLevel when the model rejects it; older models never get it", async () => {
    const [c] = await db.insert(companies).values({ name: "Y" }).returning();
    await db.insert(deals).values({ companyId: c.id, source: "places_search" });
    await saveGemini(db, { apiKey: "AQ.Ab8RNTESTKEY0123456789abcdefghij" });
    const bodies: Record<string, unknown>[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      bodies.push(b);
      if (b.generationConfig) return Response.json({ error: { status: "INVALID_ARGUMENT", message: "Thinking level is not supported for this model." } }, { status: 400 });
      return Response.json({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
    }) as unknown as typeof fetch;
    expect(await runOverview(db, c.id, f)).toBe("Google pregled je pripravljen.");
    expect(bodies.map((b) => !!b.generationConfig)).toEqual([true, false]);
    expect(usesThinkingLevel("gemini-2.5-flash")).toBe(false);
    expect(usesThinkingLevel("gemini-flash-latest")).toBe(true);
  });

  it("finds e-mails and links in the answer for the buttons", () => {
    expect(mentioned(ANSWER)).toEqual({
      emails: ["tjasamogu@gmail.com"],
      urls: ["https://www.facebook.com/people/Frizerski-salon-Pri-Slavici/100063486733971/", "https://www.bizi.si/TJASA-MOGU-S-P/"],
    });
    expect(linkKind("https://www.facebook.com/x")).toBe("facebook");
    expect(linkKind("https://www.bizi.si/X/")).toBe("directory");
    expect(linkKind("https://salonfantazija.si")).toBe("other");
  });
});
