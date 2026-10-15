# TASK-003 — feedback

## What I implemented
Drizzle schema for 8 core tables with database-level rules, migration `drizzle/0000_core.sql`, migrations at
container start, DB-aware health, do-not-contact service, e-mail/domain normalisation, CI with real Postgres.

## Files changed (path — why)
- `src/server/db/schema.ts`, `drizzle/*` — data model + migration.
- `src/server/db/client.ts`, `src/server/db/migrate.ts`, `src/instrumentation*.ts` — DB access, startup migrations.
- `src/lib/health.ts` (+test), `src/app/api/health/route.ts` — health with DB check.
- `src/server/contact/normalize.ts` (+test), `src/server/contact/dnc.ts` — DNC.
- `src/server/db/migrate.int.test.ts`, `src/server/db/rules.int.test.ts`, `vitest.int.config.mts`,
  `tests/int-global-setup.ts` — integration tests (fail without a DB, never skip).
- `Dockerfile` (ships `drizzle/`), `config/deploy.yml` (`RUN_MIGRATIONS=1`), CI and deploy smoke (`db: ok`).

## Deviations from the task (and why)
None.

## New dependencies (package@version — why)
drizzle-orm@^0.45.3, postgres@^3.4.9, drizzle-kit@^0.31.11 (dev) — fixed stack (ADR-011), same as Postaja.

## How to verify (command — expected result)
- `pnpm lint && pnpm typecheck && pnpm test` — exit 0, `Tests 8 passed (8)`.
- `TEST_DATABASE_URL=postgres://… pnpm test:int` — `Tests 8 passed (8)`.
- `pnpm build`, copy `drizzle/` next to `.next/standalone/server.js`, run with `RUN_MIGRATIONS=1 DATABASE_URL=…`
  → log `[migrate] done`, `/api/health` → `{"status":"ok","sha":"…","db":"ok"}`.

## Test results (real outputs, counts)
- Unit: `Test Files 2 passed (2) · Tests 8 passed (8)`.
- Integration (local Postgres 16.15): `Test Files 2 passed (2) · Tests 8 passed (8)`.
- Smoke: `{"status":"ok","sha":"smoke","db":"ok"} 200`, `[migrate] done`, 1 row in `drizzle.__drizzle_migrations`.

## Deliberate breaks
- Domain check in `isBlocked()` pointed at a wrong value → `FAIL … blocks by e-mail, domain and company`
  (`expected false to be true`), `Tests 1 failed | 7 passed (8)` → restored → `Tests 8 passed (8)`.
- (First attempt — removing the approval checks from a copy of the migration — broke the migration test instead of the
  rule test, so it was discarded as not meaningful.)

## NOT RUN
- Docker build/run locally (no daemon in the sandbox) — CI runs it with the DB.

## Docs updated
tasks/README, HANDOFF, architecture (data status).

## Open questions / risks
- `/api/health` now returns 503 until the database accessory runs; the owner's first deploy uses `setup`, which
  boots it first.

## Suggested commit message
feat(TASK-003): core data model, startup migrations, DB health, do-not-contact
