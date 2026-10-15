import type { Mail } from "./mailer";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Login e-mail in the Inženirji.si look (black, #00FF41, monospace). Slovenian. */
export function magicLinkMail(to: string, url: string): Mail {
  const intro = "Klikni spodnjo povezavo za prijavo v CRM. Povezava velja 10 minut in jo lahko uporabiš enkrat.";
  const ignore = "Če se nisi poskušal prijaviti, to sporočilo ignoriraj.";
  const safeUrl = escapeHtml(url);
  return {
    to,
    subject: "Prijava v CRM Inženirji.si",
    text: `${intro}\n\n${url}\n\n${ignore}\n`,
    html: `<!doctype html><html lang="sl"><body style="margin:0;background:#000000;padding:32px;font-family:Inter,Arial,sans-serif;color:#EAEAEA">
<div style="max-width:480px;margin:0 auto;border:1px solid #222222;background:#0A0A0A;padding:32px">
<p style="font-family:'JetBrains Mono',monospace;font-weight:800;font-size:18px;margin:0 0 24px">INZENIRJI<span style="color:#00FF41">.SI</span> // CRM</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 24px">${escapeHtml(intro)}</p>
<p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;background:#00FF41;color:#000000;text-decoration:none;padding:12px 20px;font-family:'JetBrains Mono',monospace;font-weight:700;letter-spacing:2px">&gt; PRIJAVA</a></p>
<p style="font-size:12px;color:#888888;word-break:break-all;margin:0 0 16px">${safeUrl}</p>
<p style="font-size:12px;color:#888888;margin:0">${escapeHtml(ignore)}</p>
</div></body></html>`,
  };
}
