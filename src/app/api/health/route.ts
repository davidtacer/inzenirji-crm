import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { checkHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const { code, body } = await checkHealth(() => getDb().execute(sql`select 1`));
  return Response.json(body, { status: code, headers: { "Cache-Control": "no-store" } });
}
