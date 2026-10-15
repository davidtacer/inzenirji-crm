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
