# TASK-024 — AI personal remark

## Acceptance
- First draft: Claude writes the remark from stored facts only; stored once per audit; rules when off/failing/over budget.
- `ai_usage` row per call (tokens, micro-USD, ok); daily budget `AI_DAILY_BUDGET_USD` (rolling 24 h).
- "Osnutki" shows whether AI is on and today's spend.
- Key `ANTHROPIC_API_KEY` only in the GitHub environment `prod`; errors never contain the key or the body.
