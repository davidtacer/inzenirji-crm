# TASK-005 — feedback

## What I implemented
Places Text Search client, mapping, import with dedupe, atomic daily cap, search action and `/iskanje` page,
company table, home counters, navigation, deploy settings.

## Files changed (path — why)
- `src/server/places/{client,import,quota,search,list}.ts` (+ tests) — prospecting.
- `src/server/db/schema.ts`, `drizzle/0002_api_calls.sql` — `api_calls`.
- `src/app/iskanje/*`, `src/components/{AppHeader,CompanyTable}.tsx`, `src/app/page.tsx` — UI.
- `config/deploy.yml`, `.kamal/secrets`, `.github/workflows/deploy-prod.yml` — key + cap.

## Deviations from the task (and why)
None.

## New dependencies
None.

## How to verify
- `pnpm test` → `Tests 19 passed (19)`; `pnpm test:int` → `Tests 19 passed (19)`.
- After deploy: `/iskanje` → "frizerski salon Celje", 1 page → message "Najdenih N: novih …", table filled,
  counter "Google Places danes: 1 / 50".

## Test results (real outputs, counts)
Unit 19/19, integration 19/19, build OK (`/iskanje` dynamic).
An integration test found a real bug during development: phones stored as `041 222 333` did not match `041222333`;
matching now compares digits only (SQL `regexp_replace`).

## Deliberate breaks
Removed the cap guard from `reserveCall` → `Tests 3 failed | 16 passed (19)` (cap, concurrency, search stop) →
restored → `Tests 19 passed (19)`.

## NOT RUN
- A real Google call — the sandbox cannot reach googleapis.com; the owner checks after deploy.

## Open questions / risks
- Google bills by the fields requested; the field mask includes phone, website and rating, which are needed for
  selection. The daily cap (50 calls ≈ 1 000 results) bounds the cost; the owner can change `PLACES_DAILY_CALL_CAP`.
