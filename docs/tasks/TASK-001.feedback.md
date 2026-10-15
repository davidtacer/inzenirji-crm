# TASK-001 — feedback

## What I implemented
Next.js 16 app (App Router, React 19, TypeScript strict, standalone output) in the Inženirji.si look (Tailwind 4
`@theme` tokens, self-hosted JetBrains Mono + Inter), Slovenian placeholder home page, `GET /api/health`, ESLint,
Vitest, CI workflow.

## Files changed (path — why)
- `package.json`, `pnpm-lock.yaml`, `.nvmrc` — app, scripts, pinned versions aligned with `DataVallis/postaja`.
- `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.mts` — tooling.
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/fonts/*` — brand look.
- `src/lib/health.ts`, `src/lib/health.test.ts`, `src/app/api/health/route.ts` — health endpoint.
- `.github/workflows/ci.yml` — CI.

## Deviations from the task (and why)
None.

## New dependencies (package@version — why)
next@16.3.8, react@19.2.8, react-dom@19.2.8; dev: typescript@5, @types/node@22, @types/react@19, @types/react-dom@19,
tailwindcss@4, @tailwindcss/postcss@4, eslint@9, eslint-config-next@16.3.8, vitest@5 — the fixed stack (ADR-002).

## How to verify (command — expected result)
- `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all exit 0.
- `pnpm build && GIT_SHA=abc PORT=3456 node .next/standalone/server.js` then `curl localhost:3456/api/health`
  — `{"status":"ok","sha":"abc"}`.

## Test results (real outputs, counts)
- lint: exit 0, no findings. typecheck: exit 0.
- `Test Files 1 passed (1) · Tests 2 passed (2)`.
- build: routes `/` (static), `/_not-found`, `/api/health` (dynamic).
- smoke: `{"status":"ok","sha":"abc"}`, `/` → 200.

## Deliberate breaks
Changed the fallback in `healthBody` to `"x"` → `Tests 1 failed | 1 passed (2)`
(`expected { status: 'ok', sha: 'x' } to deeply equal { status: 'ok', sha: 'unknown' }`) → restored → `Tests 2 passed (2)`.

## NOT RUN
- CI run — runs on the PR.
- Visual check of the home page in a browser — the standalone smoke run does not serve `/_next/static` without the
  Docker layout (TASK-002); checked the HTML status only.

## Docs updated
`docs/tasks/README.md`, `docs/HANDOFF.md`.

## Open questions / risks
None.

## Suggested commit message
feat(TASK-001): Next.js + Tailwind scaffold in the Inženirji.si look, health endpoint, CI
