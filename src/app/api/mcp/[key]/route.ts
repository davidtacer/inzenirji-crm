import { aiConfig } from "@/server/ai/remark";
import { getDb } from "@/server/db/client";
import { checkMcpToken, handleRpc } from "@/server/mcp/mcp";
import { getSettings } from "@/server/settings";

/*
 * MCP endpoint for the nightly Claude researcher (TASK-036). The key in the URL is generated at Nastavitve.
 * Stateless Streamable HTTP: every POST carries one JSON-RPC message (or a batch) and gets JSON back.
 */

export const dynamic = "force-dynamic";

async function researchDeps() {
  const st = await getSettings(getDb());
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  return { places: apiKey ? { apiKey, dailyCap: st.placesDailyCap } : undefined, directories: true, ai: aiConfig(st) };
}

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const db = getDb();
  const { key } = await ctx.params;
  if (!(await checkMcpToken(db, key))) return Response.json({ error: "not found" }, { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, { status: 400 });
  }
  const deps = await researchDeps();
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleRpc(db, m, deps)))).filter(Boolean);
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const res = await handleRpc(db, body as Parameters<typeof handleRpc>[1], deps);
  return res ? Response.json(res) : new Response(null, { status: 202 });
}

export async function GET() {
  // No server-initiated stream (stateless server).
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
