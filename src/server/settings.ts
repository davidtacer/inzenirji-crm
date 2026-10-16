import type { Db } from "./db/client";
import { settings } from "./db/schema";

/*
 * Owner settings (TASK-028, ADR-026), edited at /nastavitve and read on every use — no redeploy.
 * Passwords and API keys stay in the GitHub environment (secrets); only switches, limits and texts live here.
 * Until a value is saved, the default is used (sending off, 10 e-mails, 2 USD AI, 100 Google calls).
 */

export type Settings = {
  /** Unlocks the "Pošlji" button (ADR-013: only after DKIM passes). */
  sendingEnabled: boolean;
  /** Cold e-mails per day (warm-up starts at 10). */
  dailySendCap: number;
  /** Google Calendar appointment schedule link for replies (ADR-008, ADR-025). */
  bookingUrl: string;
  /** Owner's phone offered in replies. */
  ownerPhone: string;
  /** AI spend limit per rolling 24 h in USD. */
  aiDailyBudgetUsd: number;
  /** Google Places paid calls per day. */
  placesDailyCap: number;
  /** Research also searches the web (Claude web search) for site, profiles, directories, e-mails (TASK-031). */
  webSearchEnabled: boolean;
};

export const LIMITS = {
  dailySendCap: { min: 0, max: 50 },
  aiDailyBudgetUsd: { min: 0, max: 20 },
  placesDailyCap: { min: 0, max: 1000 },
};

export function defaultSettings(env: Record<string, string | undefined> = process.env): Settings {
  return {
    sendingEnabled: env.OUTREACH_ENABLED === "1",
    dailySendCap: Number(env.OUTREACH_DAILY_CAP ?? 10) || 10,
    bookingUrl: env.BOOKING_URL?.trim() ?? "",
    ownerPhone: env.OWNER_PHONE?.trim() ?? "",
    aiDailyBudgetUsd: Number(env.AI_DAILY_BUDGET_USD ?? 2) || 2,
    placesDailyCap: Number(env.PLACES_DAILY_CALL_CAP ?? 100) || 100,
    webSearchEnabled: true,
  };
}

export async function getSettings(db: Db, env: Record<string, string | undefined> = process.env): Promise<Settings> {
  const rows = await db.select().from(settings);
  const out = defaultSettings(env) as Record<string, unknown>;
  for (const r of rows) if (r.key in out) out[r.key] = r.value;
  return out as Settings;
}

export type SettingsInput = Record<keyof Settings, string | boolean | null | undefined>;

/** Validates form input; returns the clean settings or an error in Slovenian. */
export function validateSettings(input: Partial<SettingsInput>): { ok: true; value: Settings } | { ok: false; message: string } {
  const num = (k: keyof typeof LIMITS, label: string) => {
    const raw = String(input[k] ?? "").replace(",", ".").trim();
    const n = Number(raw);
    const { min, max } = LIMITS[k];
    if (raw === "" || !Number.isFinite(n) || n < min || n > max) throw new Error(`${label}: vpiši število od ${min} do ${max}.`);
    return k === "aiDailyBudgetUsd" ? Math.round(n * 100) / 100 : Math.round(n);
  };
  try {
    const bookingUrl = String(input.bookingUrl ?? "").trim();
    if (bookingUrl && !/^https:\/\/[^\s]+\.[^\s]+$/i.test(bookingUrl)) throw new Error("Povezava za termin se mora začeti s https://");
    const ownerPhone = String(input.ownerPhone ?? "").trim();
    if (ownerPhone && !/^[+\d][\d\s/-]{5,20}$/.test(ownerPhone)) throw new Error("Telefon: samo številke, presledki, + in -.");
    return {
      ok: true,
      value: {
        sendingEnabled: input.sendingEnabled === true || input.sendingEnabled === "on",
        dailySendCap: num("dailySendCap", "Omejitev e-mailov na dan"),
        bookingUrl,
        ownerPhone,
        aiDailyBudgetUsd: num("aiDailyBudgetUsd", "AI omejitev"),
        placesDailyCap: num("placesDailyCap", "Google klici na dan"),
        webSearchEnabled: input.webSearchEnabled === true || input.webSearchEnabled === "on",
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Neveljavne nastavitve." };
  }
}

export async function saveSettings(db: Db, value: Settings, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [key, v] of Object.entries(value)) {
      await tx.insert(settings).values({ key, value: v, updatedAt: now }).onConflictDoUpdate({ target: settings.key, set: { value: v, updatedAt: now } });
    }
  });
}
