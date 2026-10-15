# TASK-024 — feedback

## What I implemented
`src/server/ai/anthropic.ts` (Messages API via fetch, prices, cost), `remark.ts` (prompt, validation, budget,
`ensureAiRemark`), migration 0007 `ai_usage`, AI remark in `createFirstDraft`, banner on "Osnutki", deploy config.

## Test results
Unit 63/63 (+ cleanRemark rules, prompt content, client headers/body/cost, error without body). Integration 38/38
(+ generated once and reused, usage row with cost 4 800 µ$, remark in draft body; bad answer / HTTP 529 / spent budget →
null and rule-based remark; table list updated).

## Deliberate breaks
Budget check removed → `expected { …(3) } to be null` → restored.

## NOT RUN
A real Claude call (sandbox has no key and no internet) — owner prepares drafts on prod and checks the remarks.
