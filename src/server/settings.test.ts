import { describe, expect, it } from "vitest";
import { defaultSettings, validateSettings } from "./settings";
import { lockReason, outreachConfig } from "./outreach/send";
import { aiConfig } from "./ai/remark";

const ok = { sendingEnabled: "on", dailySendCap: "10", bookingUrl: "", ownerPhone: "041 123 456", aiDailyBudgetUsd: "2,5", placesDailyCap: "100" };

describe("settings", () => {
  it("defaults keep the old environment values until something is saved", () => {
    expect(defaultSettings({ OUTREACH_ENABLED: "1", AI_DAILY_BUDGET_USD: "2", PLACES_DAILY_CALL_CAP: "100" })).toEqual({
      sendingEnabled: true,
      dailySendCap: 10,
      bookingUrl: "",
      ownerPhone: "",
      aiDailyBudgetUsd: 2,
      placesDailyCap: 100,
    });
  });
  it("validates numbers in range, https link, phone", () => {
    expect(validateSettings(ok)).toEqual({ ok: true, value: { sendingEnabled: true, dailySendCap: 10, bookingUrl: "", ownerPhone: "041 123 456", aiDailyBudgetUsd: 2.5, placesDailyCap: 100 } });
    expect(validateSettings({ ...ok, dailySendCap: "500" })).toEqual({ ok: false, message: "Omejitev e-mailov na dan: vpiši število od 0 do 50." });
    expect(validateSettings({ ...ok, bookingUrl: "calendar.google.com/x" })).toMatchObject({ ok: false });
    expect(validateSettings({ ...ok, ownerPhone: "pokliči" })).toMatchObject({ ok: false });
    expect(validateSettings({ ...ok, sendingEnabled: undefined })).toMatchObject({ ok: true, value: { sendingEnabled: false } });
  });
  it("switch + password decide sending; AI needs key and budget > 0", () => {
    const s = defaultSettings({});
    expect(outreachConfig({ ...s, sendingEnabled: true }, { OUTREACH_SMTP_PASSWORD: "x" }).enabled).toBe(true);
    expect(outreachConfig({ ...s, sendingEnabled: false }, { OUTREACH_SMTP_PASSWORD: "x" }).enabled).toBe(false);
    expect(lockReason({ ...s, sendingEnabled: false }, { OUTREACH_SMTP_PASSWORD: "x" })).toMatch(/Nastavitvah/);
    expect(lockReason({ ...s, sendingEnabled: true }, {})).toMatch(/OUTREACH_SMTP_PASSWORD/);
    expect(aiConfig({ aiDailyBudgetUsd: 0 }, { ANTHROPIC_API_KEY: "k" })).toBeNull();
    expect(aiConfig({ aiDailyBudgetUsd: 1.5 }, { ANTHROPIC_API_KEY: "k" })?.dailyBudgetMicroUsd).toBe(1_500_000);
  });
});
