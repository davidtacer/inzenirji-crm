import { addToDnc } from "@/server/contact/dnc";
import { getDb } from "@/server/db/client";
import { verifyUnsubscribeToken } from "@/server/outreach/unsubscribe";

/*
 * Public opt-out (ADR-007, spec §5.5). GET shows a confirmation page (mail scanners must not opt people
 * out by prefetching); POST — the button or the RFC 8058 one-click request from Gmail/Yahoo — adds the
 * address to do-not-contact, permanently.
 */

export const dynamic = "force-dynamic";

const page = (title: string, text: string, form = "") => `<!doctype html><html lang="sl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;background:#000;color:#eaeaea;font:16px/1.6 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px}
main{max-width:460px;border:1px solid #222;background:#0a0a0a;padding:32px}h1{font:700 18px ui-monospace,monospace;color:#00ff41;margin:0 0 12px}
button{margin-top:16px;background:#00ff41;color:#000;border:1px solid #00ff41;padding:10px 18px;font:700 13px ui-monospace,monospace;text-transform:uppercase;cursor:pointer}
button:hover{background:transparent;color:#00ff41}</style></head><body><main><h1>${title}</h1><p>${text}</p>${form}</main></body></html>`;

const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

function emailFrom(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  return verifyUnsubscribeToken(t, process.env.BETTER_AUTH_SECRET ?? "");
}

export async function GET(req: Request) {
  const email = emailFrom(req);
  if (!email) return html(page("Povezava ni veljavna", "Za odjavo nam lahko preprosto odgovorite na e-mail z besedo »odjava«."), 400);
  const t = new URL(req.url).searchParams.get("t")!;
  return html(
    page(
      "Odjava",
      `Ne želite več prejemati sporočil na <b>${email.replace(/</g, "&lt;")}</b>?`,
      `<form method="post" action="/api/odjava?t=${encodeURIComponent(t)}"><button type="submit">Odjavi me</button></form>`,
    ),
  );
}

export async function POST(req: Request) {
  const email = emailFrom(req);
  if (!email) return html(page("Povezava ni veljavna", "Za odjavo nam lahko preprosto odgovorite na e-mail z besedo »odjava«."), 400);
  await addToDnc(getDb(), { kind: "email", value: email, reason: "odjava (povezava v e-mailu)" });
  return html(page("Odjavljeni ste", "Vašega naslova ne bomo več kontaktirali. Hvala in lep dan, David (inženirji.si)."));
}
