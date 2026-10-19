import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { activities, companies, contacts, deals, drafts } from "../db/schema";
import { distinctiveWords, domainCarriesName } from "../research/websearch";
import { domainOf, normalizeEmail } from "./normalize";
import { websiteKind } from "./website";

/*
 * Which e-mail addresses belong to a company (ADR-044). Research kept picking up the address of the page it read the
 * company on (info@doberfrizer.si, info@pirs.si, info@visitcelje.eu ...), and drafts went to directories instead of
 * the salons. Rule: a free-mail address (gmail, siol ...) is the business's own; an address on any other domain only
 * when that domain is the company's website domain or carries the company's name. Everything else is never used for
 * outreach. Known directories/portals are rejected outright, even as candidates.
 */

/** Directories, portals and listing sites: their addresses are never a company's. */
export const AGGREGATOR_DOMAINS = [
  "doberfrizer.si", "najdi.si", "bizi.si", "ceneje.si", "pirs.si", "povezujemo.si", "visitcelje.eu", "toplocalplaces.com",
  "itis.si", "telekom.si", "tsmedia.si", "imenik.si", "ajpes.si", "zlatestrani.si", "moja-dejavnost.si", "mojastoritev.net",
  "mojastoritev.si", "vsestoritve.si", "e-creditreform.si", "moje-podjetje.si", "stop-neplacniki.si", "javnipodatki.si",
  "imenik-podjetij.si", "poslovni-imenik.si", "slovenia.info", "visitmaribor.si", "visitljubljana.com", "maribor-pohorje.si",
  "zurnal24.si", "24ur.com", "deloindom.si", "salonsi.si", "lepotni-saloni.si", "frizerji.si", "treatwell.com", "fresha.com",
  "booksy.com", "facebook.com", "instagram.com", "google.com", "gmail.google.com", "wix.com", "wixpress.com", "example.com",
  "sentry.io", "yelp.com", "tripadvisor.com", "cylex.si", "cylex-slovenija.si", "infobel.com", "hotfrog.si", "find-open.si",
];

/** Free mail providers: a business without its own domain uses these. */
export const FREE_MAIL = [
  "gmail.com", "googlemail.com", "siol.net", "t-2.net", "amis.net", "hotmail.com", "outlook.com", "live.com", "msn.com",
  "yahoo.com", "icloud.com", "me.com", "gmx.com", "gmx.net", "telemach.net", "guest.arnes.si", "email.si", "volja.net",
  "triera.net", "kabelnet.net", "proton.me", "protonmail.com", "aol.com",
];

const inList = (d: string, list: string[]) => list.some((x) => d === x || d.endsWith(`.${x}`));

export const isAggregatorDomain = (d: string | null) => !!d && inList(d, AGGREGATOR_DOMAINS);
export const isFreeMail = (d: string | null) => !!d && inList(d, FREE_MAIL);

export type EmailVerdict = { ok: true } | { ok: false; reason: "aggregator" | "foreign_domain" | "invalid" };

/** Whether an address may be the company's own (see the rule above). */
export function emailBelongs(rawEmail: string, company: { name: string; website?: string | null; websiteDomain?: string | null }): EmailVerdict {
  const email = normalizeEmail(rawEmail);
  const d = domainOf(email);
  if (!email || !d) return { ok: false, reason: "invalid" };
  const own = company.websiteDomain ?? domainOf(company.website ?? null);
  const ownDomain = own && websiteKind(own) === "own" ? own : null;
  if (ownDomain && (d === ownDomain || d.endsWith(`.${ownDomain}`) || ownDomain.endsWith(`.${d}`))) return { ok: true };
  if (isAggregatorDomain(d)) return { ok: false, reason: "aggregator" };
  if (isFreeMail(d)) return { ok: true };
  if (domainCarriesName(d, company.name) || stemInDomain(d, company.name)) return { ok: true };
  return { ok: false, reason: "foreign_domain" };
}

/** "slavica.si" for "Pri Slavici": Slovenian names change their ending, so compare word stems (5+ letters). */
function stemInDomain(d: string, name: string): boolean {
  const label = d.split(".").slice(0, -1).join("").replace(/[^a-z0-9]/g, "");
  return distinctiveWords(name).some((w) => w.length >= 5 && label.includes(w.slice(0, Math.max(5, w.length - 2))));
}

export const VERDICT_REASON: Record<"aggregator" | "foreign_domain" | "invalid", string> = {
  aggregator: "agregator (imenik, portal)",
  foreign_domain: "tuja domena (ni domena podjetja)",
  invalid: "ni veljaven e-naslov",
};

/** The company's e-mails that may be used (not marked invalid), oldest first. */
export async function validEmails(db: Db, companyId: string): Promise<string[]> {
  const rows = await db
    .select({ email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.companyId, companyId), sql`${contacts.email} is not null`, isNull(contacts.invalidAt)))
    .orderBy(contacts.createdAt);
  return rows.map((r) => r.email!).filter(Boolean);
}

/** True when this address is marked invalid anywhere (an aggregator's address is wrong for every company). */
export async function isInvalidEmail(db: Db, email: string): Promise<boolean> {
  const e = normalizeEmail(email);
  if (!e) return true;
  const [r] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.email, e), sql`${contacts.invalidAt} is not null`)).limit(1);
  return !!r;
}

/**
 * Stops everything that would go to wrong addresses of a company: open drafts to an invalid address are discarded;
 * when no valid address is left, all open e-mails and follow-ups of the deal are discarded and no follow-up is due.
 * Returns how many drafts were discarded.
 */
export async function stopMailToInvalid(db: Db, companyId: string, now = new Date()): Promise<number> {
  const [deal] = await db.select({ id: deals.id }).from(deals).where(eq(deals.companyId, companyId)).limit(1);
  if (!deal) return 0;
  const valid = await validEmails(db, companyId);
  const open = await db
    .select({ id: drafts.id, toEmail: drafts.toEmail, kind: drafts.kind })
    .from(drafts)
    .where(and(eq(drafts.dealId, deal.id), inArray(drafts.status, ["pending", "approved"])));
  const drop = open.filter((d) => !valid.includes(d.toEmail)).map((d) => d.id);
  if (drop.length) await db.update(drafts).set({ status: "discarded" }).where(inArray(drafts.id, drop));
  if (!valid.length) await db.update(deals).set({ nextActionAt: null, updatedAt: now }).where(and(eq(deals.id, deal.id), eq(deals.stage, "contacted")));
  return drop.length;
}

/** Owner: this address is wrong (kept, so research never adds it back). */
export async function markEmailInvalid(db: Db, companyId: string, rawEmail: string, reason: string, now = new Date()) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false as const, message: "Neveljaven e-naslov." };
  const r = await db
    .update(contacts)
    .set({ invalidAt: now, invalidReason: reason.trim().slice(0, 200) || "napačen" })
    .where(and(eq(contacts.companyId, companyId), eq(contacts.email, email)))
    .returning({ id: contacts.id });
  if (!r.length) return { ok: false as const, message: "Tega e-naslova ni pri podjetju." };
  const dropped = await stopMailToInvalid(db, companyId, now);
  const [deal] = await db.select({ id: deals.id }).from(deals).where(eq(deals.companyId, companyId)).limit(1);
  if (deal) await db.insert(activities).values({ dealId: deal.id, type: "note", at: now, payload: { kind: "email_invalid", email, reason } });
  const left = (await validEmails(db, companyId)).length;
  return { ok: true as const, message: `${email} je označen kot napačen.${dropped ? ` Preklicanih osnutkov: ${dropped}.` : ""}${left ? "" : " Podjetje nima več veljavnega e-naslova, zato je v seznamu Za klic."}` };
}

/** Owner: the address is fine after all. */
export async function markEmailValid(db: Db, companyId: string, rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false as const, message: "Neveljaven e-naslov." };
  await db.update(contacts).set({ invalidAt: null, invalidReason: null }).where(and(eq(contacts.companyId, companyId), eq(contacts.email, email)));
  return { ok: true as const, message: `${email} je spet veljaven.` };
}

/**
 * One-off and idempotent clean-up of addresses research added before the rule (run at server start): for leads not
 * contacted yet, addresses that do not belong to the company are marked invalid and their drafts discarded.
 * Addresses of companies that already talked to us are left alone.
 */
export async function sweepForeignEmails(db: Db, now = new Date()): Promise<{ marked: number; drafts: number }> {
  const rows = await db
    .select({ companyId: contacts.companyId, email: contacts.email, name: companies.name, website: companies.website, websiteDomain: companies.websiteDomain })
    .from(contacts)
    .innerJoin(companies, eq(companies.id, contacts.companyId))
    .innerJoin(deals, eq(deals.companyId, companies.id))
    .where(and(isNull(contacts.invalidAt), sql`${contacts.email} is not null`, inArray(deals.stage, ["found", "researched"]), sql`${deals.source} = 'places_search'`));
  let marked = 0;
  let dropped = 0;
  const touched = new Set<string>();
  for (const r of rows) {
    const v = emailBelongs(r.email!, r);
    if (v.ok) continue;
    await db
      .update(contacts)
      .set({ invalidAt: now, invalidReason: `${VERDICT_REASON[v.reason]} (samodejno)` })
      .where(and(eq(contacts.companyId, r.companyId), eq(contacts.email, r.email!)));
    marked++;
    touched.add(r.companyId);
  }
  const { rescoreCompany } = await import("../scoring/apply");
  for (const id of touched) {
    dropped += await stopMailToInvalid(db, id, now);
    await rescoreCompany(db, id);
  }
  return { marked, drafts: dropped };
}
