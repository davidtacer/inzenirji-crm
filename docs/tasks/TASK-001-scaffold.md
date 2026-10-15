# TASK-001 — Scaffold: Next.js + Tailwind (Inženirji.si tokens), checks, CI

## Goal
An empty but real app: Next.js App Router in the Inženirji.si look, `/api/health`, and lint/typecheck/test/build
green locally and in GitHub Actions. Nothing domain-specific yet.

## Scope
### 1. App
- Next.js 16 (App Router), React 19, TypeScript strict, `output: "standalone"` (Docker in TASK-002).
- Tailwind 4 with the brand tokens from `inzenirji.si/tailwind.config.ts` as CSS `@theme` variables.
- Fonts JetBrains Mono + Inter, self-hosted woff2 (copied from `inzenirji.si`, OFL licences included).
- Home page: Slovenian placeholder "CRM // Danes" in the brand style.
- `GET /api/health` → `{ status: "ok", sha }`, `Cache-Control: no-store` (DB check is added in TASK-003).
### 2. Tooling
- pnpm 10, Node 22, ESLint (next core-web-vitals + typescript), `tsc --noEmit`, Vitest.
### 3. CI
- `.github/workflows/ci.yml` on PRs to `dev`/`main` and pushes to `dev`: install (frozen) → lint → typecheck → test → build.

## Decisions already made (do not re-decide)
ADR-002 (Next.js + Tailwind, brand), ADR-011 (Postgres/Drizzle/pg-boss/Better Auth come later), ADR-012 (mode B).

## Tests
- Unit: health payload has `status: "ok"` and the SHA from `GIT_SHA`, `"unknown"` when unset.

## Must not touch
Server, secrets, `ops/`.

## Allowed dependencies
next, react, react-dom; dev: typescript, @types/*, tailwindcss, @tailwindcss/postcss, eslint, eslint-config-next, vitest.
Versions aligned with `DataVallis/postaja`.

## Acceptance criteria
`pnpm lint && pnpm typecheck && pnpm test && pnpm build` green locally and in CI; home page renders in the brand look.
