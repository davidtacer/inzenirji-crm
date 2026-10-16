import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { projectFiles } from "@/server/db/schema";
import { readStored } from "@/server/projects/storage";

export const dynamic = "force-dynamic";

/** Owner downloads a client file (TASK-014). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Prijava je potrebna.", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Ni.", { status: 404 });
  const [f] = await getDb().select().from(projectFiles).where(eq(projectFiles.id, id)).limit(1);
  if (!f) return new Response("Ni.", { status: 404 });
  const data = await readStored(f.path).catch(() => null);
  if (!data) return new Response("Datoteke ni več na strežniku.", { status: 410 });
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": f.mime,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "cache-control": "private, no-store",
    },
  });
}
