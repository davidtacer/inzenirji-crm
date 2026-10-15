# TASK-006 — feedback

## What I implemented
See `docs/technical/research.md`. UI: /podjetja and /podjetja/[id].

## Test results
Unit `Tests 34 passed (34)` (+13: SSRF guard, analyzer, issues, group/summary), integration `Tests 23 passed (23)`
(+4: old WordPress site → A with e-mail+source+competitor+stage; no site → B without fetching; unreachable → B,
later stage untouched; batch only `found`). Screenshots checked locally (list + detail with sample audits).

## Deliberate breaks
E-mail source set to the Google website instead of the fetched page → `FAIL … published e-mail with source` →
restored → `Tests 23 passed (23)`.

## NOT RUN
Real fetches of company sites — the sandbox cannot reach the internet; checked on prod after deploy.

## Open questions / risks
DNS rebinding (see technical doc). Batch runs inside the request (≤ 20 × 10 s / 3 in parallel ≈ ≤ 70 s); moves to
the pg-boss worker when the headless browser arrives.
