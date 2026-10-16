import { getDb } from "@/server/db/client";
import { checkDemoToken, importDemoLead, parseDemoLead } from "@/server/demo/demo";

/*
 * Leads from the public editor demo (TASK-032). Called by the editor (Cloudflare Worker) with the token generated
 * at /nastavitve. Answers 2xx only when the lead is stored, so the editor retries otherwise.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const db = getDb();
  if (!(await checkDemoToken(db, req.headers.get("authorization")))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const lead = parseDemoLead(body);
  if (!lead) return Response.json({ error: "invalid_request" }, { status: 400 });
  const res = await importDemoLead(db, lead);
  return Response.json({ ok: true, companyId: res.companyId, created: res.created, duplicate: res.duplicate });
}
