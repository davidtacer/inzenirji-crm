import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { companies, deals, proposals } from "../db/schema";
import { pickSite, searchWeek } from "../google/searchconsole";
import { adsFor } from "../reports/schedule";
import { cacCents, collectWeek, cplCents, renderEmail } from "../reports/weekly";
import { insights, leadsFrom, metaConfig, metaMessage, MetaError, parseAccountId, saveMeta } from "./meta";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 3 });
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-meta-0123456789abcd";

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
beforeEach(async () => {
  await admin.unsafe("TRUNCATE companies, settings RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

const TOKEN = "EAAtesttoken0123456789abcdefghijklmnopqrstuvwxyz";

const metaFetch = (calls: { url: string; auth: string }[]) =>
  (async (u: string, init: RequestInit) => {
    calls.push({ url: u, auth: (init.headers as Record<string, string>).Authorization });
    return Response.json({
      data: [
        { campaign_name: "Demo urejevalnika", spend: "84.50", impressions: "12000", clicks: "240", account_currency: "EUR", actions: [{ action_type: "link_click", value: "240" }, { action_type: "lead", value: "6" }] },
        { campaign_name: "Nova stran", spend: "40", impressions: "5000", clicks: "60", account_currency: "EUR", actions: [{ action_type: "offsite_conversion.fb_pixel_lead", value: "2" }] },
      ],
    });
  }) as unknown as typeof fetch;

describe("Meta Ads + Search Console (TASK-015)", () => {
  it("parses ids and counts leads", () => {
    expect(parseAccountId("act_1234567890")).toBe("1234567890");
    expect(parseAccountId("https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=987654321&nav_entry_point=x")).toBe("987654321");
    expect(parseAccountId("abc")).toBeNull();
    expect(leadsFrom([{ action_type: "lead", value: "3" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "3" }])).toBe(3);
    expect(leadsFrom([{ action_type: "onsite_conversion.lead_grouped", value: "1" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "2" }])).toBe(2);
    expect(metaMessage(new MetaError(400, "Error validating access token: Session has expired"))).toMatch(/žeton je potekel/);
  });

  it("stores the token encrypted and reads a week of insights with the token in a header", async () => {
    expect(await adsFor(db, "2026-10-12", "2026-10-18")).toEqual({ data: null, error: "Meta oglasi niso povezani (Nastavitve → Meta oglasi)." });
    await saveMeta(db, { token: TOKEN, accountId: "1234567890" });
    expect(JSON.stringify((await admin`select value from settings where key = 'metaAds'`)[0].value)).not.toContain("EAAtest");
    const cfg = (await metaConfig(db))!;
    const calls: { url: string; auth: string }[] = [];
    const w = await insights(cfg, "2026-10-12", "2026-10-18", metaFetch(calls));
    expect(w).toMatchObject({ spendCents: 12450, impressions: 17000, clicks: 300, leads: 8, currency: "EUR" });
    expect(w.campaigns.map((c) => [c.name, c.leads])).toEqual([["Demo urejevalnika", 6], ["Nova stran", 2]]);
    expect(calls[0].url).toContain("/v25.0/act_1234567890/insights?");
    expect(calls[0].url).toContain(encodeURIComponent('{"since":"2026-10-12","until":"2026-10-18"}'));
    expect(calls[0].url).not.toContain("EAAtest");
    expect(calls[0].auth).toBe(`Bearer ${TOKEN}`);
  });

  it("the weekly report gets ads, search, CAC and CPL", async () => {
    const [c] = await db.insert(companies).values({ name: "Salon A" }).returning();
    const [d] = await db.insert(deals).values({ companyId: c.id, source: "meta_lead_form", createdAt: new Date("2026-10-13T09:00:00+02:00") }).returning();
    await db.insert(proposals).values({ dealId: d.id, token: "t", title: "x", items: [{ label: "x", priceCents: 59000 }], validUntil: "2026-11-01", status: "accepted", sentAt: new Date("2026-10-14T09:00:00+02:00"), acceptedAt: new Date("2026-10-15T09:00:00+02:00"), acceptedName: "A" });
    await saveMeta(db, { token: TOKEN, accountId: "1234567890" });
    const cfg = (await metaConfig(db))!;
    const seen: string[] = [];
    const week = await collectWeek(db, "2026-10-12", {
      now: new Date("2026-10-19T08:00:00+02:00"),
      ads: async (since, until) => {
        seen.push(`${since}..${until}`);
        return { data: await insights(cfg, since, until, metaFetch([])), error: null };
      },
      search: async () => ({ data: { site: "sc-domain:inzenirji.si", clicks: 12, impressions: 340, position: 18.4, queries: [{ key: "izdelava spletne strani maribor", clicks: 3, impressions: 40, position: 9.1 }], pages: [] }, error: null }),
    });
    expect(seen).toEqual(["2026-10-12..2026-10-18"]);
    expect(cacCents(week)).toBe(12450);
    expect(cplCents(week)).toBe(1556);
    const m = renderEmail(week, null, ["a", "b", "c"], "https://crm.inzenirji.si");
    expect(m.text).toContain("Meta oglasi: 124,50 €, 300 klikov, 8 leadov (15,56 € na lead)");
    expect(m.text).toContain("CAC (oglasi na prodajo): 124,50 €");
    expect(m.text).toContain("Google iskanje: 12 klikov, 340 prikazov, povprečni položaj 18,4");
  });

  it("Search Console: picks our property and reads a week", async () => {
    expect(pickSite([{ siteUrl: "https://uredi-dev.inzenirji.si/" }, { siteUrl: "https://www.inzenirji.si/" }, { siteUrl: "sc-domain:inzenirji.si" }])).toBe("sc-domain:inzenirji.si");
    expect(pickSite([{ siteUrl: "https://datavallis.com/" }])).toBeNull();
    const bodies: unknown[] = [];
    const f = (async (u: string, init: RequestInit) => {
      if (u.endsWith("/sites")) return Response.json({ siteEntry: [{ siteUrl: "https://www.inzenirji.si/" }] });
      const b = JSON.parse(String(init.body));
      bodies.push(b);
      if (!b.dimensions.length) return Response.json({ rows: [{ clicks: 12, impressions: 340, position: 18.44 }] });
      return Response.json({ rows: [{ keys: [b.dimensions[0] === "query" ? "inzenirji" : "https://www.inzenirji.si/"], clicks: 5, impressions: 20, position: 1.2 }] });
    }) as unknown as typeof fetch;
    const w = (await searchWeek("tok", "2026-10-12", "2026-10-18", f))!;
    expect(w).toMatchObject({ site: "https://www.inzenirji.si/", clicks: 12, impressions: 340, position: 18.4, queries: [{ key: "inzenirji", clicks: 5 }] });
    expect(bodies[0]).toMatchObject({ startDate: "2026-10-12", endDate: "2026-10-18" });
  });
});
