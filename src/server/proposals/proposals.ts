import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { activities, companies, contacts, deals, drafts, inboundMessages, proposals } from "../db/schema";
import { MATERIALS, type CallSummary } from "../calls/calls";
import type { Settings } from "../settings";

/*
 * Proposals (TASK-013 part 1, ADR-031): drafted from the call summary, edited by the owner, shown to the client at
 * /ponudba/<token>, e-mailed as a reply draft (ADR-004: the owner still approves and sends). Views and acceptance are
 * tracked; payment is marked by the owner ("won" = prepayment received, spec §4).
 */

export type Item = { label: string; priceCents: number };
export const NEW_SITE_CENTS = 59_000;

export function totals(items: Item[], vatRateBp: number, vatPayer: boolean, depositPct: number) {
  const net = items.reduce((s, i) => s + i.priceCents, 0);
  const vat = vatPayer ? Math.round((net * vatRateBp) / 10_000) : 0;
  const gross = net + vat;
  return { net, vat, gross, deposit: Math.round((gross * depositPct) / 100) };
}

export const eur = (cents: number) => `${(cents / 100).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** "Opis | 590" or "Opis | 1.200,50" per line → items; an empty or invalid price is an error message. */
export function parseItems(text: string): Item[] | string {
  const items: Item[] = [];
  for (const [n, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;
    const [label, price] = line.split("|").map((x) => x.trim());
    if (!label) return `Vrstica ${n + 1}: manjka opis.`;
    const p = (price ?? "").replace(/€/g, "").replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const v = Number(p);
    if (!p || !Number.isFinite(v) || v < 0) return `Vrstica ${n + 1}: vpiši ceno za »${label}« (npr. ${label} | 590).`;
    items.push({ label: label.slice(0, 200), priceCents: Math.round(v * 100) });
  }
  return items.length ? items : "Dodaj vsaj eno postavko.";
}

export const itemsToText = (items: Item[]) => items.map((i) => `${i.label} | ${(i.priceCents / 100).toFixed(2).replace(".", ",")}`).join("\n");

function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

/** Draft from the call summary; returns the existing draft if there is one. */
export async function createProposal(db: Db, companyId: string, st: Settings, now = new Date()) {
  const [row] = await db.select({ c: companies, d: deals }).from(companies).innerJoin(deals, eq(deals.companyId, companies.id)).where(eq(companies.id, companyId)).limit(1);
  if (!row) return null;
  const [existing] = await db.select().from(proposals).where(and(eq(proposals.dealId, row.d.id), eq(proposals.status, "draft"))).limit(1);
  if (existing) return existing;
  const sum = (row.d.callSummary as CallSummary | null) ?? null;
  const pkg = sum?.package ?? row.c.group ?? "B";
  const items: Item[] =
    pkg === "A"
      ? [{ label: "Prenos obstoječe spletne strani na platformo inženirji.si z urejevalnikom", priceCents: 0 }]
      : [{ label: "Nova spletna stran (oblikovanje, vsebina, prilagojena telefonom, osnovni SEO in optimizacija za AI iskalnike)", priceCents: NEW_SITE_CENTS }];
  const intro = [
    `Hvala za pogovor. Kot dogovorjeno vam pošiljam ponudbo za ${pkg === "A" ? "prenos vaše spletne strani na našo platformo, kjer jo urejate sami" : "novo spletno stran"}.`,
    sum?.scope ? `Obseg: ${sum.scope}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const [p] = await db
    .insert(proposals)
    .values({
      dealId: row.d.id,
      token: randomBytes(18).toString("base64url"),
      title: `Ponudba za ${pkg === "A" ? "prenos spletne strani" : "novo spletno stran"} - ${row.c.name}`,
      intro,
      items,
      vatRateBp: 2200,
      depositPct: 50,
      timelineDays: 7,
      materials: sum?.materials?.length ? sum.materials : [...MATERIALS],
      validUntil: addDays(now, st.proposalValidDays),
    })
    .returning();
  return p;
}

export type ProposalEdit = { title: string; intro: string; items: string; timelineDays: string; depositPct: string; materials: string; validUntil: string };

export async function updateProposal(db: Db, id: string, e: ProposalEdit): Promise<string | null> {
  const items = parseItems(e.items);
  if (typeof items === "string") return items;
  const days = Number(e.timelineDays);
  const dep = Number(e.depositPct);
  if (!Number.isInteger(days) || days < 1 || days > 120) return "Rok izdelave: 1–120 dni.";
  if (!Number.isInteger(dep) || dep < 0 || dep > 100) return "Predplačilo: 0–100 %.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.validUntil)) return "Neveljaven datum veljavnosti.";
  if (!e.title.trim()) return "Vpiši naslov ponudbe.";
  const r = await db
    .update(proposals)
    .set({
      title: e.title.trim().slice(0, 200),
      intro: e.intro.trim().slice(0, 3000),
      items,
      timelineDays: days,
      depositPct: dep,
      materials: e.materials.split("\n").map((m) => m.trim()).filter(Boolean).slice(0, 30),
      validUntil: e.validUntil,
      updatedAt: new Date(),
    })
    .where(and(eq(proposals.id, id), sql`${proposals.status} in ('draft', 'sent')`))
    .returning({ id: proposals.id });
  return r.length ? null : "Sprejete ponudbe ni mogoče več spreminjati.";
}

export function proposalUrl(token: string, appUrl = process.env.APP_URL ?? "https://crm.inzenirji.si") {
  return `${appUrl}/ponudba/${token}`;
}

/**
 * Prepares the e-mail with the link as a reply draft (threaded to their last message) and marks the proposal sent;
 * the owner approves and sends it in Osnutki. Refuses when a price is 0 or the seller details are missing.
 */
export async function proposalEmail(db: Db, id: string, st: Settings, now = new Date()): Promise<{ ok: true; draftId: string } | { ok: false; message: string }> {
  const [p] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
  if (!p) return { ok: false, message: "Ponudbe ni." };
  if ((p.items as Item[]).some((i) => i.priceCents <= 0)) return { ok: false, message: "Vse postavke morajo imeti ceno (pri prenosu jo vpiši po pregledu obsega)." };
  if (!st.sellerName || !st.iban) return { ok: false, message: "V Nastavitvah izpolni podatke za ponudbo (ime s.p., naslov, IBAN)." };
  const [d] = await db.select().from(deals).where(eq(deals.id, p.dealId)).limit(1);
  const [lastIn] = await db
    .select({ messageId: inboundMessages.messageId, from: inboundMessages.fromEmail, subject: inboundMessages.subject })
    .from(inboundMessages)
    .where(and(eq(inboundMessages.companyId, d.companyId), eq(inboundMessages.direction, "in")))
    .orderBy(desc(inboundMessages.receivedAt))
    .limit(1);
  const [contact] = await db.select({ email: contacts.email }).from(contacts).where(and(eq(contacts.companyId, d.companyId), sql`${contacts.email} is not null`)).limit(1);
  const to = lastIn?.from ?? contact?.email;
  if (!to) return { ok: false, message: "Podjetje nima e-naslova." };
  const t = totals(p.items as Item[], p.vatRateBp, st.vatPayer, p.depositPct);
  const body = [
    "Pozdravljeni,",
    "hvala za pogovor. Kot dogovorjeno vam pošiljam ponudbo:",
    proposalUrl(p.token),
    `Skupaj ${eur(t.gross)}${st.vatPayer ? " z DDV" : ""}, stran je na spletu v ${p.timelineDays} dneh od prejema vseh materialov. Na povezavi je tudi seznam materialov, ki jih potrebujemo, in podatki za ${p.depositPct} % predplačilo.`,
    "Če se strinjate, ponudbo potrdite s klikom na povezavi. Za vprašanja sem na voljo.",
    "Lp,\nDavid\ninženirji.si",
  ].join("\n\n");
  const subject = lastIn?.subject ? (/^re:/i.test(lastIn.subject) ? lastIn.subject : `Re: ${lastIn.subject}`) : p.title;
  const [dr] = await db
    .insert(drafts)
    .values({ dealId: p.dealId, kind: "reply", toEmail: to.toLowerCase(), subject, body, inReplyTo: lastIn?.messageId ?? null })
    .onConflictDoNothing()
    .returning({ id: drafts.id });
  if (!dr) return { ok: false, message: "Osnutek odgovora na zadnje sporočilo že obstaja — uredi ga v Osnutkih." };
  await db.update(proposals).set({ status: p.status === "draft" ? "sent" : p.status, sentAt: p.sentAt ?? now, updatedAt: now }).where(eq(proposals.id, p.id));
  await db.update(deals).set({ stage: "proposal_sent", nextActionAt: new Date(now.getTime() + 3 * 86_400_000), updatedAt: now }).where(and(eq(deals.id, p.dealId), sql`${deals.stage} not in ('won', 'lost')`));
  await db.insert(activities).values({ dealId: p.dealId, type: "stage_change", at: now, payload: { to: "proposal_sent", proposalId: p.id, by: "owner" } });
  return { ok: true, draftId: dr.id };
}

/** Public page: proposal + company. Drafts only for the owner (preview). Counts client views. */
export async function openProposal(db: Db, token: string, opts: { owner: boolean; now?: Date }) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const [r] = await db
    .select({ p: proposals, company: { name: companies.name, address: companies.address, city: companies.city } })
    .from(proposals)
    .innerJoin(deals, eq(deals.id, proposals.dealId))
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(eq(proposals.token, token))
    .limit(1);
  if (!r || (r.p.status === "draft" && !opts.owner)) return null;
  if (!opts.owner) {
    const now = opts.now ?? new Date();
    await db
      .update(proposals)
      .set({ viewCount: sql`${proposals.viewCount} + 1`, firstViewedAt: r.p.firstViewedAt ?? now, lastViewedAt: now })
      .where(eq(proposals.id, r.p.id));
  }
  return r;
}

export async function acceptProposal(db: Db, token: string, name: string, now = new Date()): Promise<string | null> {
  const who = name.trim();
  if (who.length < 3) return "Vpišite ime in priimek.";
  const [p] = await db.select().from(proposals).where(eq(proposals.token, token)).limit(1);
  if (!p || p.status === "draft") return "Ponudbe ni.";
  if (p.status === "accepted") return null;
  if (p.validUntil < now.toISOString().slice(0, 10)) return "Ponudba je potekla — pišite nam za novo.";
  await db.update(proposals).set({ status: "accepted", acceptedAt: now, acceptedName: who.slice(0, 120), updatedAt: now }).where(eq(proposals.id, p.id));
  await db.insert(activities).values({ dealId: p.dealId, type: "note", at: now, payload: { proposalAccepted: true, by: who.slice(0, 120), proposalId: p.id } });
  await db.update(deals).set({ nextActionAt: now, updatedAt: now }).where(eq(deals.id, p.dealId));
  return null;
}

export async function listProposals(db: Db) {
  return db
    .select({ p: proposals, companyId: companies.id, companyName: companies.name, stage: deals.stage })
    .from(proposals)
    .innerJoin(deals, eq(deals.id, proposals.dealId))
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .orderBy(desc(proposals.updatedAt))
    .limit(200);
}

export async function proposalsOfCompany(db: Db, companyId: string) {
  return db
    .select()
    .from(proposals)
    .innerJoin(deals, eq(deals.id, proposals.dealId))
    .where(eq(deals.companyId, companyId))
    .orderBy(desc(proposals.createdAt))
    .then((rows) => rows.map((r) => r.proposals));
}

export async function getProposal(db: Db, id: string) {
  const [r] = await db
    .select({ p: proposals, companyId: companies.id, companyName: companies.name })
    .from(proposals)
    .innerJoin(deals, eq(deals.id, proposals.dealId))
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(eq(proposals.id, id))
    .limit(1);
  return r ?? null;
}
