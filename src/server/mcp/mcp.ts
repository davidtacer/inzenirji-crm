import { randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { audits, companies, deals, settings } from "../db/schema";
import { decrypt, encrypt } from "../google/crypto";
import { runningJob, startJob } from "../jobs";
import { companyDetail, runAudit, type AuditDeps } from "../research/run";
import { parseResearch } from "../research/websearch";

/*
 * MCP server for the nightly Claude researcher (TASK-036, ADR-038). Claude (a scheduled task on the owner's Claude
 * account) connects to /api/mcp/<key> as a custom connector, takes companies from the research queue, researches them
 * on the web with its own tools and saves the findings. The CRM verifies them exactly like its own search (pages are
 * opened, e-mails need a page that publishes them) and then re-runs the normal research (site, Google, issues, group,
 * score) with these findings, as a background job. The key is part of the URL (custom connectors have no header
 * field); it is stored encrypted and a new one replaces the old.
 */

const KEY = "mcpToken";
const secret = () => process.env.BETTER_AUTH_SECRET ?? "";

export async function createMcpToken(db: Db, now = new Date()): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const value = { enc: encrypt(token, secret()), createdAt: now.toISOString() };
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } });
  return token;
}

export async function mcpTokenInfo(db: Db): Promise<{ token: string; createdAt: Date } | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
  const v = row?.value as { enc?: string; createdAt?: string } | undefined;
  if (!v?.enc) return null;
  try {
    return { token: decrypt(v.enc, secret()), createdAt: new Date(v.createdAt ?? 0) };
  } catch {
    return null;
  }
}

export async function checkMcpToken(db: Db, got: string): Promise<boolean> {
  const info = await mcpTokenInfo(db);
  if (!info || !/^[A-Za-z0-9_-]{32}$/.test(got)) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(info.token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------------- tools ---------------- */

export const INSTRUCTIONS = `CRM Inženirji.si (spletne strani za mala podjetja v Sloveniji). Za nočno raziskavo:
1) research_queue vrne podjetja, ki jih je treba raziskati.
2) Za vsako podjetje na spletu poišči vse, kar bi našel izkušen prodajalec v 5 minutah z Googlom (uradna domena, tudi iz opisa na Instagramu/Facebooku, profili s sledilci in opisom, stare strani na Wixu ipd., imeniki najdi.si/bizi.si, pravna oseba, javni e-naslovi in telefoni z URL-jem vira, osebe, storitve, dejstva za osebni e-mail). Odpri strani in preveri, da gre za isto podjetje (ime, naslov, telefon). Ničesar ne ugibaj.
3) save_research shrani ugotovitve; CRM jih preveri in podjetje znova oceni.
E-naslovi: samo naslov podjetja (na njegovi domeni ali gmail/siol ipd.), objavljen na njegovi strani ali profilu (Facebook O nas, Instagram). Nikoli naslova imenika ali portala, kjer je podjetje navedeno (doberfrizer.si, najdi.si, bizi.si, pirs.si, visitcelje.eu ...). Naslovov, ki jih get_company kaže kot "invalid", ne pošiljaj znova.`;

export const TOOLS = [
  {
    name: "research_queue",
    description:
      "Companies that need web research, best leads first: never researched by you, or researched more than 30 days ago. Returns id, name, category, address, city, phone, Google website, rating and what the CRM already knows.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50, default: 20 } }, additionalProperties: false },
  },
  {
    name: "get_company",
    description: "Everything the CRM knows about one company: data, contacts, links, latest research findings and issues.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "save_research",
    description:
      "Save your web research for one company. The CRM verifies it (opens the pages; e-mails need a source page that shows them) and re-runs its analysis in the background. Use only facts you found; leave unknown fields empty.",
    inputSchema: {
      type: "object",
      required: ["id", "findings"],
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        findings: {
          type: "object",
          properties: {
            website: { type: ["string", "null"], description: "The company's own domain (https://…), also when it only appears in a social bio or shows 'v izdelavi'." },
            website_from: { type: ["string", "null"], description: "Where you found it, e.g. 'Instagram bio', 'Google', 'najdi.si'." },
            other_sites: { type: "array", items: { type: "object", properties: { url: { type: "string" }, note: { type: "string" } } } },
            profiles: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  kind: { type: "string", enum: ["instagram", "facebook", "tiktok", "linkedin", "youtube"] },
                  url: { type: "string" },
                  handle: { type: "string" },
                  followers: { type: "integer" },
                  bio: { type: "string" },
                  website: { type: "string" },
                },
              },
            },
            links: { type: "array", items: { type: "object", properties: { url: { type: "string" }, kind: { type: "string", enum: ["directory", "booking", "article", "other"] }, note: { type: "string" } } } },
            entities: { type: "array", items: { type: "object", properties: { name: { type: "string" }, address: { type: "string" }, tax_id: { type: "string" }, source: { type: "string" } } } },
            emails: {
              type: "array",
              description: "Only the company's own addresses (its domain or free mail), with the page or profile that shows them. Never a directory's/portal's address.",
              items: { type: "object", properties: { email: { type: "string" }, source_url: { type: "string" } }, required: ["email", "source_url"] },
            },
            phones: { type: "array", items: { type: "string" } },
            people: { type: "array", items: { type: "object", properties: { name: { type: "string" }, role: { type: "string" } } } },
            services: { type: "array", items: { type: "string" } },
            facts: { type: "array", items: { type: "string" }, description: "Concrete facts useful for a personal e-mail." },
            summary: { type: "string", description: "2–3 sentences: who they are, what they offer, state of their online presence." },
          },
        },
      },
    },
  },
] as const;

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (v: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(v, null, 1) }] });
const fail = (msg: string): ToolResult => ({ content: [{ type: "text", text: msg }], isError: true });
const UUID = /^[0-9a-f-]{36}$/;

export async function researchQueue(db: Db, limit = 20) {
  const n = Math.min(Math.max(Math.round(limit) || 20, 1), 50);
  // Latest audit researched by the agent within 30 days → not in the queue.
  const recentAgent = sql`exists (select 1 from ${audits} a where a.company_id = ${companies.id} and a.data->'web'->>'by' = 'agent' and a.created_at > now() - interval '30 days')`;
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      category: companies.category,
      address: companies.address,
      city: companies.city,
      phone: companies.phone,
      website: companies.website,
      ratingX10: companies.ratingX10,
      reviewCount: companies.reviewCount,
      score: companies.score,
      stage: deals.stage,
    })
    .from(companies)
    .innerJoin(deals, eq(deals.companyId, companies.id))
    .where(and(inArray(deals.stage, ["found", "researched", "contacted", "replied", "nurture"]), sql`not ${recentAgent}`))
    .orderBy(sql`${companies.score} desc nulls last`, desc(sql`coalesce(${companies.ratingX10}, 0) * least(coalesce(${companies.reviewCount}, 0), 200)`))
    .limit(n);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    address: r.address,
    city: r.city,
    phone: r.phone,
    google_website: r.website,
    rating: r.ratingX10 === null ? null : r.ratingX10 / 10,
    reviews: r.reviewCount,
    score: r.score,
    stage: r.stage,
  }));
}

export async function getCompany(db: Db, id: string) {
  const d = await companyDetail(db, id);
  if (!d) return null;
  const data = (d.audit?.data ?? {}) as { web?: unknown; siteState?: unknown };
  return {
    id: d.company.id,
    name: d.company.name,
    category: d.company.category,
    address: d.company.address,
    city: d.company.city,
    phone: d.company.phone,
    website: d.company.website,
    group: d.company.group,
    score: d.company.score,
    stage: d.stage,
    contacts: d.contacts.map((c) => ({ name: c.name, email: c.email, source: c.emailSource, phone: c.phone, ...(c.invalidAt ? { invalid: c.invalidReason ?? "napačen" } : {}) })),
    links: d.links.map((l) => ({ url: l.url, kind: l.kind, verified: l.verified, note: l.note })),
    research: data.web ?? null,
    site_state: data.siteState ?? null,
    issues: d.audit?.issues ?? [],
    researched_at: d.audit?.createdAt ?? null,
  };
}

/** Saves agent findings and re-runs the research with them as a background job. */
export async function saveResearch(db: Db, id: string, findings: unknown, deps: AuditDeps) {
  const parsed = parseResearch(JSON.stringify(findings ?? {}));
  if (!parsed) return { error: "findings must be a JSON object" };
  const [c] = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, id)).limit(1);
  if (!c) return { error: "company not found" };
  if (await runningJob(db, ["research_one"], id)) return { error: "a research of this company is running; try again in 2 minutes" };
  await startJob(db, { kind: "research_one", companyId: id }, async () => {
    const r = await runAudit(db, id, { ...deps, webSearch: false, agentFindings: parsed });
    return `Nočna raziskava (Claude): skupina ${r.group}, težav ${r.issues}, e-naslovov ${r.emails}${r.web?.website ? ", spletna stran" : ""}${r.web?.candidates ? `, ${r.web.candidates} e-naslovov za potrditev` : ""}.`;
  });
  return { saved: true, company: c.name, note: "Verification and analysis run in the background (about a minute)." };
}

export async function callTool(db: Db, name: string, args: Record<string, unknown>, deps: AuditDeps): Promise<ToolResult> {
  switch (name) {
    case "research_queue":
      return ok(await researchQueue(db, Number(args.limit ?? 20)));
    case "get_company": {
      const id = String(args.id ?? "");
      if (!UUID.test(id)) return fail("invalid id");
      const c = await getCompany(db, id);
      return c ? ok(c) : fail("company not found");
    }
    case "save_research": {
      const id = String(args.id ?? "");
      if (!UUID.test(id)) return fail("invalid id");
      const r = await saveResearch(db, id, args.findings, deps);
      return "error" in r ? fail(String(r.error)) : ok(r);
    }
    default:
      return fail(`unknown tool ${name}`);
  }
}

/* ---------------- JSON-RPC (MCP Streamable HTTP, JSON responses, stateless) ---------------- */

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const PROTOCOL = "2025-06-18";

export async function handleRpc(db: Db, msg: RpcRequest, deps: AuditDeps): Promise<object | null> {
  const id = msg.id ?? null;
  const result = (r: unknown) => ({ jsonrpc: "2.0", id, result: r });
  const error = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (msg.id === undefined) return null; // notification
  switch (msg.method) {
    case "initialize":
      return result({
        protocolVersion: typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "inzenirji-crm", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    case "ping":
      return result({});
    case "tools/list":
      return result({ tools: TOOLS });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        return result(await callTool(db, name, args, deps));
      } catch (e) {
        console.error("[mcp] tool failed:", name, e instanceof Error ? e.message : "unknown");
        return result(fail("internal error"));
      }
    }
    default:
      return error(-32601, `method not found: ${msg.method}`);
  }
}

