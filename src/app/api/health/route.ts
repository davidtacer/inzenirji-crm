import { healthBody } from "@/lib/health";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(healthBody(), { headers: { "Cache-Control": "no-store" } });
}
