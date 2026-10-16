/*
 * Minimal Anthropic Messages API client (TASK-024). No SDK: one POST, so no new dependency.
 * Errors carry the HTTP status only — never the key or the response body.
 */

export const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

/** USD per million tokens (platform.claude.com/docs/en/about-claude/pricing, checked 2026-10-15). */
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

export class AiError extends Error {
  constructor(public status: number) {
    super(`AI_HTTP_${status}`);
  }
}

export type ClaudeResult = { text: string; inputTokens: number; outputTokens: number; costMicroUsd: number };

export function costMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model] ?? PRICES["claude-sonnet-5-5"];
  return Math.ceil(inputTokens * p.input + outputTokens * p.output);
}

export async function callClaude(
  req: { model: string; system: string; user: string; maxTokens: number },
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
      }),
    });
    if (!res.ok) throw new AiError(res.status);
    const d = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
    const text = (d.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    const inputTokens = d.usage?.input_tokens ?? 0;
    const outputTokens = d.usage?.output_tokens ?? 0;
    return { text, inputTokens, outputTokens, costMicroUsd: costMicroUsd(req.model, inputTokens, outputTokens) };
  } finally {
    clearTimeout(timer);
  }
}

/** USD per web search (platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool, checked 2026-10-16). */
export const WEB_SEARCH_MICRO_USD = 10_000;

export type SearchResult = { text: string; urls: { url: string; title: string }[]; searches: number; inputTokens: number; outputTokens: number; costMicroUsd: number };

/**
 * One request with Anthropic's server-side web search tool (TASK-031). Continues once on `pause_turn`.
 * Returns Claude's final text, every result URL it saw, and the cost (tokens + searches).
 */
export async function callClaudeWithSearch(
  req: { model: string; system: string; user: string; maxTokens: number; maxSearches: number; country?: string; city?: string },
  deps: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<SearchResult> {
  type Block = { type: string; text?: string; content?: unknown };
  const messages: { role: string; content: unknown }[] = [{ role: "user", content: req.user }];
  const out: SearchResult = { text: "", urls: [], searches: 0, inputTokens: 0, outputTokens: 0, costMicroUsd: 0 };
  for (let turn = 0; turn < 2; turn++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 90_000);
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
              user_location: { type: "approximate", country: req.country ?? "SI", ...(req.city ? { city: req.city } : {}), timezone: "Europe/Ljubljana" },
            },
          ],
        }),
      });
      if (!res.ok) throw new AiError(res.status);
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
    if (d.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: blocks });
  }
  out.text = out.text.trim();
  return out;
}
