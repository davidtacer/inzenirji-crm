# TASK-020 — feedback

## What I implemented
Better Auth magic-link login limited to `OWNER_EMAILS`, session re-check on every page, login/logout UI, branded
login e-mail, SMTP mailer, deploy settings.

## Files changed (path — why)
- `src/server/db/schema.ts`, `drizzle/0001_auth.sql` — auth tables.
- `src/server/auth/{auth,session,emails}.ts`, `src/app/api/auth/[...all]/route.ts`, `src/lib/auth-client.ts` — auth.
- `src/server/email/{mailer,magic-link}.ts` — mail.
- `src/app/login/*`, `src/app/logout-button.tsx`, `src/app/page.tsx` — UI, protected home.
- `config/deploy.yml`, `.kamal/secrets`, `.github/workflows/{ci,deploy-prod}.yml` — env, secret, checks.
- Docs: ADR-015, CHEATSHEET, HANDOFF, tasks.

## Deviations from the task (and why)
None.

## New dependencies (package@version — why)
better-auth@1.7.7, nodemailer@10.0.15, @types/nodemailer@8.0.2 (dev) — fixed stack (ADR-011), same versions as Postaja.

## How to verify
- `pnpm lint && pnpm typecheck && pnpm test` → `Tests 11 passed (11)`.
- `TEST_DATABASE_URL=… pnpm test:int` → `Tests 13 passed (13)`.
- Standalone server: `/` → 307 to `/login`; `/login` → 200; stranger POST `/api/auth/sign-in/magic-link` →
  `{"status":true}` 200 with no mail; `/api/health` → `db: ok`.

## Test results (real outputs, counts)
Unit 11/11, integration 13/13, smoke as above.

## Deliberate breaks
Owner check in the user-create hook disabled → `FAIL … the database hook refuses a non-owner user even if created
directly`, `Tests 1 failed | 12 passed (13)` → restored → `Tests 13 passed (13)`.

## NOT RUN
- Real e-mail delivery from `hello@inzenirji.si` — needs the owner's `SMTP_PASSWORD` secret; checked after deploy.
- Docker locally (no daemon) — CI runs the container.

## Open questions / risks
None.
