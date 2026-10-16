import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { settings } from "../db/schema";
import { decrypt, encrypt } from "./crypto";

/*
 * Gemini with Grounding with Google Search (TASK-037, ADR-039), for the owner-started "Google pregled" only.
 * Google's terms: the grounded result is shown to the person who asked, with its Search Suggestions, unchanged; it is
 * not parsed into the database and its links are not crawled by us; its text may be stored up to two years. So the CRM
 * stores the text as a note and offers buttons; only what the owner clicks is saved.
 * The API key is set in Nastavitve (stored encrypted), not in env, so the owner needs no deploy.
 */

const KEY = "gemini";
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
const secret = () => process.env.BETTER_AUTH_SECRET ?? "";

export type GeminiConfig = { apiKey: string; model: string };

export async function saveGemini(db: Db, input: { apiKey?: string | null; model?: string | null }, now = new Date()) {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
  const old = (row?.value ?? {}) as { enc?: string; model?: string };
  const value = {
    enc: input.apiKey ? encrypt(input.apiKey.trim(), secret()) : (old.enc ?? null),
    model: (input.model ?? "").trim() || old.model || DEFAULT_GEMINI_MODEL,
  };
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } });
}

export async function geminiConfig(db: Db): Promise<GeminiConfig | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
  const v = (row?.value ?? {}) as { enc?: string | null; model?: string };
  if (!v.enc) return null;
  try {
    return { apiKey: decrypt(v.enc, secret()), model: v.model || DEFAULT_GEMINI_MODEL };
  } catch {
    return null;
  }
}

export async function geminiStatus(db: Db): Promise<{ set: boolean; model: string }> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
  const v = (row?.value ?? {}) as { enc?: string | null; model?: string };
  return { set: !!v.enc, model: v.model || DEFAULT_GEMINI_MODEL };
}

export class GeminiError extends Error {
  constructor(
    public status: number,
    public detail: string | null,
  ) {
    super(`GEMINI_HTTP_${status}`);
  }
}

export type Grounded = {
  text: string;
  /** Google's Search Suggestions chip (HTML), which must be shown with the result. */
  searchHtml: string | null;
  queries: string[];
  sources: { title: string; uri: string }[];
  inputTokens: number;
  outputTokens: number;
};

export async function groundedSearch(cfg: GeminiConfig, prompt: string, fetchImpl: typeof fetch = fetch, timeoutMs = 60_000): Promise<Grounded> {
  const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    let detail: string | null = null;
    try {
      const j = (await res.json()) as { error?: { message?: string; status?: string } };
      detail = [j.error?.status, j.error?.message].filter(Boolean).join(": ").slice(0, 300) || null;
    } catch {
      /* no body */
    }
    throw new GeminiError(res.status, detail);
  }
  const d = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      groundingMetadata?: {
        webSearchQueries?: string[];
        searchEntryPoint?: { renderedContent?: string };
        groundingChunks?: { web?: { uri?: string; title?: string } }[];
      };
    }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const c = d.candidates?.[0];
  const g = c?.groundingMetadata;
  return {
    text: (c?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim(),
    searchHtml: g?.searchEntryPoint?.renderedContent ?? null,
    queries: g?.webSearchQueries ?? [],
    sources: (g?.groundingChunks ?? []).map((x) => ({ title: x.web?.title ?? "", uri: x.web?.uri ?? "" })).filter((s) => s.uri),
    inputTokens: d.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: d.usageMetadata?.candidatesTokenCount ?? 0,
  };
}
