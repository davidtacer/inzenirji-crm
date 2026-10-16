import { aiConfig } from "@/server/ai/remark";
import { parseEmailList } from "@/server/auth/emails";
import { getDb } from "@/server/db/client";
import { checkDemoToken } from "@/server/demo/demo";
import { createMailerFromEnv } from "@/server/email/mailer";
import { importWebsiteLead, parseWebsiteLead } from "@/server/leads/website";
import { contactOptions } from "@/server/mailbox/reply";
import { getSettings } from "@/server/settings";

/*
 * Inquiries from the inzenirji.si form (TASK-033). Same key as the editor demo (Nastavitve → Leadi s spleta).
 * Answers 2xx only when the inquiry is stored, so the landing can tell the visitor whether it worked.
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
  const lead = parseWebsiteLead(body);
  if (!lead) return Response.json({ error: "invalid_request" }, { status: 400 });
  const st = await getSettings(db);
  const owner = [...parseEmailList(process.env.OWNER_EMAILS)][0];
  let notify: { mailer: ReturnType<typeof createMailerFromEnv>; to: string; appUrl: string } | undefined;
  try {
    if (owner) notify = { mailer: createMailerFromEnv(), to: owner, appUrl: process.env.APP_URL ?? "https://crm.inzenirji.si" };
  } catch {
    notify = undefined;
  }
  const res = await importWebsiteLead(db, lead, { ai: aiConfig(st), contact: contactOptions(st), notify });
  return Response.json({ ok: true, companyId: res.companyId, created: res.created, duplicate: res.duplicate });
}
