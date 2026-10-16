import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { companies, deals } from "../db/schema";
import { latestJob } from "../jobs";
import { checkMcpToken, createMcpToken, handleRpc } from "./mcp";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-mcp-0123456789";

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies, settings, jobs RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

const resolve = async () => ["93.184.216.34"];
const fetchImpl = (async (u: string) => {
  const s = String(u);
  if (s.includes("salonfantazija.si")) return new Response("<html><head><title>Salon Fantazija — Aplikacija je v izgradnji</title></head><body></body></html>", { status: 200 });
  if (s.includes("najdi.si")) return new Response("<p>SALON FANTAZIJA, Miklošičeva ulica 5, 3000 Celje, 031 241 241, info@salonfantazija.si</p>", { status: 200 });
  return new Response("<p>x</p>", { status: 200 });
}) as unknown as typeof fetch;
const deps = { resolve, fetchImpl };
const rpc = (method: string, params: Record<string, unknown> = {}, id: number | undefined = 1) => handleRpc(db, { jsonrpc: "2.0", id, method, params }, deps);
const text = (r: unknown) => JSON.parse((r as { result: { content: { text: string }[] } }).result.content[0]!.text);

describe("MCP for the nightly researcher (TASK-036)", () => {
  it("key: 32 chars, checked, replaced", async () => {
    const k = await createMcpToken(db);
    expect(k).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(await checkMcpToken(db, k)).toBe(true);
    expect(await checkMcpToken(db, "x".repeat(32))).toBe(false);
    await createMcpToken(db);
    expect(await checkMcpToken(db, k)).toBe(false);
  });

  it("initialize, tools/list, notifications", async () => {
    expect(await rpc("initialize", { protocolVersion: "2025-06-18" })).toMatchObject({ result: { protocolVersion: "2025-06-18", serverInfo: { name: "inzenirji-crm" }, capabilities: { tools: {} } } });
    const list = (await rpc("tools/list")) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(["research_queue", "get_company", "save_research"]);
    expect(await handleRpc(db, { jsonrpc: "2.0", method: "notifications/initialized" }, deps)).toBeNull();
    expect(await rpc("nope")).toMatchObject({ error: { code: -32601 } });
  });

  it("queue → save findings → verified, analysed in the background, leaves the queue", async () => {
    const [c] = await db.insert(companies).values({ name: "Frizerski salon FANTAZIJA", address: "Miklošičeva ulica 5, 3000 Celje", city: "Celje", phone: "031 241 241", ratingX10: 49, reviewCount: 260, score: 83 }).returning();
    await db.insert(deals).values({ companyId: c.id, source: "places_search", stage: "researched" });
    const q = text(await rpc("tools/call", { name: "research_queue", arguments: { limit: 5 } }));
    expect(q).toEqual([expect.objectContaining({ id: c.id, name: "Frizerski salon FANTAZIJA", rating: 4.9, reviews: 260 })]);

    const saved = await rpc("tools/call", {
      name: "save_research",
      arguments: {
        id: c.id,
        findings: {
          website: null,
          profiles: [{ kind: "instagram", url: "https://www.instagram.com/salonfantazija/", handle: "salonfantazija", followers: 2888, bio: "Fantazija sredi Celja.", website: "https://www.salonfantazija.si" }],
          emails: [{ email: "info@salonfantazija.si", source_url: "https://zemljevid.najdi.si/podjetje/x" }],
          facts: ["osmo leto"],
          summary: "Frizerski salon v Celju.",
        },
      },
    });
    expect(text(saved)).toMatchObject({ saved: true });
    for (let i = 0; i < 100; i++) {
      const j = await latestJob(db, ["research_one"], c.id);
      if (j?.status !== "running") break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(await latestJob(db, ["research_one"], c.id)).toMatchObject({ status: "done", message: expect.stringContaining("Nočna raziskava") });
    const g = text(await rpc("tools/call", { name: "get_company", arguments: { id: c.id } }));
    expect(g).toMatchObject({ website: "https://www.salonfantazija.si", group: "B", research: { by: "agent", websiteState: "under_construction", facts: ["osmo leto"] } });
    expect(g.contacts).toEqual([expect.objectContaining({ email: "info@salonfantazija.si", source: "https://zemljevid.najdi.si/podjetje/x" })]);
    expect(text(await rpc("tools/call", { name: "research_queue", arguments: {} }))).toEqual([]);
  });

  it("refuses bad ids and unknown companies", async () => {
    expect(await rpc("tools/call", { name: "get_company", arguments: { id: "x" } })).toMatchObject({ result: { isError: true } });
    expect(await rpc("tools/call", { name: "save_research", arguments: { id: "00000000-0000-0000-0000-000000000000", findings: {} } })).toMatchObject({ result: { isError: true } });
  });
});
