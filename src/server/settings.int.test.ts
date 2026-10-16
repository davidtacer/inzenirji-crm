import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./db/client";
import { runMigrations } from "./db/migrate";
import { getSettings, saveSettings } from "./settings";

const url = process.env.TEST_DATABASE_URL!;
const admin = postgres(url, { max: 1, onnotice: () => {} });
const db = createDb(url, { max: 2 });

beforeAll(async () => {
  await admin.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(url);
});
afterAll(async () => {
  await admin.end({ timeout: 5 });
  await db.$client.end({ timeout: 5 });
});

describe("settings in the database", () => {
  it("saved values win over the environment and can be changed again", async () => {
    const env = { OUTREACH_ENABLED: "1", PLACES_DAILY_CALL_CAP: "100" };
    expect((await getSettings(db, env)).sendingEnabled).toBe(true);
    const s = { sendingEnabled: false, dailySendCap: 15, bookingUrl: "https://calendar.app.google/abc", ownerPhone: "041 123 456", aiDailyBudgetUsd: 3, placesDailyCap: 200, webSearchEnabled: true };
    await saveSettings(db, s);
    expect(await getSettings(db, env)).toEqual(s);
    await saveSettings(db, { ...s, sendingEnabled: true });
    expect((await getSettings(db, env)).sendingEnabled).toBe(true);
    expect((await admin`select count(*)::int n from settings`)[0].n).toBe(7);
  });
});
