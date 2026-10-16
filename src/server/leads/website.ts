import { eq, sql } from "drizzle-orm";
import { domainOf, normalizeEmail } from "../contact/normalize";
import type { Db } from "../db/client";
import { companies, contacts, deals, inboundMessages } from "../db/schema";
import { leadName } from "../demo/demo";
import type { Mailer } from "../email/mailer";
import type { AiConfig } from "../ai/remark";
import { matchAddress, processInbound } from "../mailbox/process";
import type { ContactOptions } from "../mailbox/reply";

/*
 * Inquiries from the form on inzenirji.si (TASK-033, ADR-035). The landing POSTs them to /api/leads/website with the
 * same key as the editor demo. An inquiry becomes a company (or joins a known one) with a deal `website_form`, and
 * is stored as an incoming message, so the normal mailbox flow applies: it shows in "Pogovor", the deal moves to
 * "replied" and an AI reply draft waits in Osnutki for approval (ADR-004). The owner also gets a short e-mail.
 */

export type WebsiteLead = {
  ref: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  message: string;
  page: string | null;
  newsletter: boolean;
  at: Date;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseWebsiteLead(body: unknown, now = new Date()): WebsiteLead | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const email = normalizeEmail(str(b.email, 254));
  const ref = str(b.ref, 64).toLowerCase().replace(/-/g, "");
  const name = str(b.name, 120);
  if (!email || !name || !/^[0-9a-f]{8,64}$/.test(ref)) return null;
  return {
    ref,
    name,
    email,
    phone: str(b.phone, 40) || null,
    company: str(b.company, 160) || null,
    message: str(b.message, 3000),
    page: str(b.page, 300) || null,
    newsletter: b.newsletter === true,
    at: now,
  };
}

export const messageIdFor = (ref: string) => `<form-${ref}@inzenirji.si>`;

/** The inquiry as an incoming e-mail (so the conversation and the reply flow work as for any reply). */
export function asMail(lead: WebsiteLead) {
  const lines = [
    lead.message || "(brez sporočila)",
    "",
    "--",
    `Ime: ${lead.name}`,
    lead.company ? `Podjetje: ${lead.company}` : "",
    lead.phone ? `Telefon: ${lead.phone}` : "",
    lead.page ? `Stran: ${lead.page}` : "",
    "Poslano z obrazca na inzenirji.si",
  ].filter((l) => l !== "");
  return {
    messageId: messageIdFor(lead.ref),
    from: lead.email,
    to: [],
    subject: "Vaše povpraševanje na inzenirji.si",
    text: lines.join("\n"),
    date: lead.at,
    inReplyTo: null,
    references: [],
    autoSubmitted: null,
  };
}

export async function importWebsiteLead(
  db: Db,
  lead: WebsiteLead,
  deps: { ai: AiConfig | null; contact?: ContactOptions; notify?: { mailer: Mailer; to: string; appUrl: string } },
): Promise<{ companyId: string; created: boolean; duplicate: boolean }> {
  const mail = asMail(lead);
  const [dup] = await db.select({ companyId: inboundMessages.companyId }).from(inboundMessages).where(eq(inboundMessages.messageId, mail.messageId)).limit(1);
  if (dup?.companyId) return { companyId: dup.companyId, created: false, duplicate: true };

  // Known by e-mail (or own domain), else by the exact company name, else new.
  let companyId = (await matchAddress(db, lead.email))?.companyId;
  if (!companyId && lead.company) {
    const [byName] = await db.select({ id: companies.id }).from(companies).where(sql`lower(${companies.name}) = lower(${lead.company})`).limit(1);
    companyId = byName?.id;
  }
  const created = !companyId;
  const emailDomain = domainOf(lead.email);
  const name = lead.company || leadName({ email: lead.email, website: null });
  await db.transaction(async (tx) => {
    if (!companyId) {
      const own = name !== lead.email && emailDomain && name === emailDomain;
      const [c] = await tx
        .insert(companies)
        .values({ name, phone: lead.phone, ...(own ? { website: `https://${emailDomain}`, websiteDomain: emailDomain } : {}) })
        .returning({ id: companies.id });
      companyId = c.id;
    }
    const [deal] = await tx.select({ id: deals.id }).from(deals).where(eq(deals.companyId, companyId));
    if (!deal) await tx.insert(deals).values({ companyId, source: "website_form" });
    await tx
      .insert(contacts)
      .values({ companyId, name: lead.name, email: lead.email, emailSource: "obrazec na inzenirji.si", phone: lead.phone })
      .onConflictDoNothing();
  });
  if (!companyId) throw new Error("company not created");

  await processInbound(db, [mail], { ai: deps.ai, contact: deps.contact, forceClass: "interested", now: lead.at });

  if (deps.notify) {
    const url = `${deps.notify.appUrl.replace(/\/+$/, "")}/podjetja/${companyId}`;
    const text = [
      `${lead.name}${lead.company ? ` (${lead.company})` : ""} je oddal povpraševanje na inzenirji.si.`,
      "",
      lead.message || "(brez sporočila)",
      "",
      `E-naslov: ${lead.email}`,
      lead.phone ? `Telefon: ${lead.phone}` : "",
      "",
      `V CRM: ${url}`,
      "Osnutek odgovora čaka v Osnutkih.",
    ]
      .filter((l, i, a) => l !== "" || a[i - 1] !== "")
      .join("\n");
    try {
      await deps.notify.mailer.send({
        to: deps.notify.to,
        subject: `Novo povpraševanje: ${lead.company || lead.name}`,
        text,
        html: `<pre style="font:14px/1.5 system-ui,sans-serif;white-space:pre-wrap">${text.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!)}</pre>`,
      });
    } catch (e) {
      console.error("[leads] owner notification failed:", (e as Error).name);
    }
  }
  return { companyId, created, duplicate: false };
}
