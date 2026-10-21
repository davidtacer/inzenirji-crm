import { eq } from "drizzle-orm";
import { domainOf } from "../contact/normalize";
import type { Db } from "../db/client";
import { companies } from "../db/schema";

/*
 * The owner corrects a company's basic details on the company page (ADR-051): name, phone, address, city,
 * website and category. A company created from the website form gets the e-mail as its name, and the name
 * shows on the proposal ("Za:") and in the UPN payment purpose, so it must be editable.
 */

export type CompanyEdit = { name: string; phone: string; address: string; city: string; website: string; category: string };

export type EditResult = { ok: true } | { ok: false; message: string };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Validates and normalises the form. Empty optional fields become null. */
export function parseCompanyEdit(input: CompanyEdit):
  | { ok: true; values: { name: string; phone: string | null; address: string | null; city: string | null; website: string | null; websiteDomain: string | null; category: string | null } }
  | { ok: false; message: string } {
  const name = clean(input.name);
  if (name.length < 2) return { ok: false, message: "Vpiši ime podjetja (vsaj 2 znaka)." };
  if (name.length > 200) return { ok: false, message: "Ime je predolgo (največ 200 znakov)." };
  const phone = clean(input.phone);
  if (phone && !/^[+\d\s()/.-]{6,30}$/.test(phone)) return { ok: false, message: "Telefon ni veljaven (samo številke, presledki, +, /, -)." };
  const rawWeb = input.website.trim();
  const website = rawWeb ? (/^https?:\/\//i.test(rawWeb) ? rawWeb : `https://${rawWeb}`) : null;
  if (website) {
    try {
      const u = new URL(website);
      if (!u.hostname.includes(".") || /\s/.test(website) || website.length > 990) throw new Error("bad");
    } catch {
      return { ok: false, message: "Spletna stran ni veljaven naslov." };
    }
  }
  const max = (s: string, n: number) => clean(s).slice(0, n) || null;
  return {
    ok: true,
    values: {
      name,
      phone: phone || null,
      address: max(input.address, 300),
      city: max(input.city, 100),
      website,
      websiteDomain: domainOf(website),
      category: max(input.category, 150),
    },
  };
}

export async function updateCompanyDetails(db: Db, id: string, input: CompanyEdit): Promise<EditResult> {
  const parsed = parseCompanyEdit(input);
  if (!parsed.ok) return parsed;
  const rows = await db
    .update(companies)
    .set({ ...parsed.values, updatedAt: new Date() })
    .where(eq(companies.id, id))
    .returning({ id: companies.id });
  return rows.length ? { ok: true } : { ok: false, message: "Podjetje ne obstaja." };
}
