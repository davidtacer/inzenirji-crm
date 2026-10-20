/*
 * Minimal Anthropic Messages API client (TASK-024). No SDK: one POST, so no new dependency.
 * Errors carry the HTTP status and Anthropic's short error message (never the key).
 */

export const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

/** USD per million tokens (platform.claude.com/docs/en/about-claude/pricing, checked 2026-10-15). */
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

export class AiError extends Error {
  constructor(
    public status: number,
    /** Anthropic's error type and message, e.g. "invalid_request_error: web search is not enabled …" (≤ 300 chars). */
    public detail: string | null = null,
  ) {
    super(`AI_HTTP_${status}`);
  }
}

/** Reads `{error: {type, message}}` from a failed response; never throws. */
export async function errorDetail(res: Response): Promise<string | null> {
  try {
    const j = (await res.json()) as { error?: { type?: string; message?: string } };
    const t = [j.error?.type, j.error?.message].filter(Boolean).join(": ");
    return t ? t.slice(0, 300) : null;
  } catch {
    return null;
  }
}

export type ClaudeResult = { text: string; inputTokens: number; outputTokens: number; costMicroUsd: number; stopReason?: string | null };

/** A JSON schema for structured outputs: the answer is always valid JSON of this shape (owner 2026-10-20: "ni JSON"). */
export type JsonSchema = Record<string, unknown>;

export function costMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model] ?? PRICES["claude-sonnet-5-5"];
  return Math.ceil(inputTokens * p.input + outputTokens * p.output);
}

export async function callClaude(
  req: { model: string; system: string; user: string; maxTokens: number; schema?: JsonSchema },
  deps: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<ClaudeResult> {
  try {
    return await callClaudeOnce(req, deps);
  } catch (e) {
    // A model without structured outputs: ask again without the schema (the caller parses leniently).
    if (req.schema && e instanceof AiError && e.status === 400 && /output_config|json_schema|format/i.test(e.detail ?? "")) {
      return callClaudeOnce({ ...req, schema: undefined }, deps);
    }
    throw e;
  }
}

async function callClaudeOnce(
  req: { model: string; system: string; user: string; maxTokens: number; schema?: JsonSchema },
  deps: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<ClaudeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 45_000);
  try {
    const res = await (deps.fetchImpl ?? fetch)(ANTHROPIC_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", "x-api-key": deps.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: "user", content: req.user }],
        ...(req.schema ? { output_config: { format: { type: "json_schema", schema: req.schema } } } : {}),
      }),
    });
    if (!res.ok) throw new AiError(res.status, await errorDetail(res));
    const d = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; stop_reason?: string };
    const text = (d.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    const inputTokens = d.usage?.input_tokens ?? 0;
    const outputTokens = d.usage?.output_tokens ?? 0;
    return { text, inputTokens, outputTokens, costMicroUsd: costMicroUsd(req.model, inputTokens, outputTokens), stopReason: d.stop_reason ?? null };
  } finally {
    clearTimeout(timer);
  }
}

/** USD per web search (platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool, checked 2026-10-16). */
export const WEB_SEARCH_MICRO_USD = 10_000;

export type SearchResult = { text: string; urls: { url: string; title: string }[]; searches: number; inputTokens: number; outputTokens: number; costMicroUsd: number; stopReason: string | null };

/**
 * One request with Anthropic's server-side web search tool (TASK-031). Continues on `pause_turn` (up to 5 requests).
 * Returns Claude's final text, every result URL it saw, and the cost (tokens + searches).
 */
export async function callClaudeWithSearch(
  req: { model: string; system: string; user: string; maxTokens: number; maxSearches: number; country?: string; city?: string },
  deps: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<SearchResult> {
  type Block = { type: string; text?: string; content?: unknown };
  const messages: { role: string; content: unknown }[] = [{ role: "user", content: req.user }];
  const out: SearchResult = { text: "", urls: [], searches: 0, inputTokens: 0, outputTokens: 0, costMicroUsd: 0, stopReason: null };
  for (let turn = 0; turn < 5; turn++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 120_000);
    let d: { content?: Block[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } } };
    try {
      const res = await (deps.fetchImpl ?? fetch)(ANTHROPIC_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", "x-api-key": deps.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: req.model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages,
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: req.maxSearches,
              // No user_location: the API rejects country "SI" ("Country code SI is not supported", 2026-10-16).
              // The prompt names Slovenia, the city and the address instead.
            },
          ],
        }),
      });
      if (!res.ok) throw new AiError(res.status, await errorDetail(res));
      d = await res.json();
    } finally {
      clearTimeout(timer);
    }
    const blocks = d.content ?? [];
    for (const b of blocks) {
      if (b.type === "text" && b.text) out.text += b.text;
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content as { url?: string; title?: string }[]) if (r.url) out.urls.push({ url: r.url, title: r.title ?? "" });
      }
    }
    const it = d.usage?.input_tokens ?? 0;
    const ot = d.usage?.output_tokens ?? 0;
    const s = d.usage?.server_tool_use?.web_search_requests ?? 0;
    out.inputTokens += it;
    out.outputTokens += ot;
    out.searches += s;
    out.costMicroUsd += costMicroUsd(req.model, it, ot) + s * WEB_SEARCH_MICRO_USD;
    out.stopReason = d.stop_reason ?? null;
    if (d.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: blocks });
  }
  out.text = out.text.trim();
  return out;
}
