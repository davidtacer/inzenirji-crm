# TASK-002 — feedback

## What I implemented
Dockerfile (multi-stage, standalone, non-root user, HEALTHCHECK), Kamal config for the shared host (ADR-011/014),
Deploy prod workflow (push to `main` or manual, `setup` for the first run, exact-SHA smoke check), CI step that
builds the image, runs it and checks `/api/health` and `/`.

## Files changed (path — why)
- `Dockerfile`, `.dockerignore`, `public/.gitkeep` — image.
- `config/deploy.yml`, `.kamal/secrets` — Kamal (no values, environment only).
- `.github/workflows/deploy-prod.yml` — deploy; `.github/workflows/ci.yml` — Docker step.
- `docs/03-DECISIONS.md` (ADR-014), manifest, architecture, CHEATSHEET, HANDOFF, tasks — names and owner steps.

## Deviations from the task (and why)
None.

## New dependencies
None (Kamal gem ~> 2.7 is installed only in the deploy workflow, as in Postaja).

## How to verify
- CI "Docker build + container health" green on the PR.
- After the owner's first run: `curl https://crm.inzenirji.si/api/health` → `{"status":"ok","sha":"<main SHA>"}`.

## Test results (real outputs, counts)
See the PR's CI run (Docker step). Local Docker build — NOT RUN (no Docker daemon in the agent sandbox).

## Deliberate breaks
NOT RUN — the meaningful break (wrong SHA) is covered by the smoke check comparing the exact commit.

## NOT RUN
- Local `docker build` — no daemon in the sandbox; CI builds it.
- `kamal setup` / deploy — owner step (ADR-012, agent never deploys; sandbox cannot SSH).

## Docs updated
ADR-014, manifest, architecture, CHEATSHEET, HANDOFF, tasks/README.

## Open questions / risks
- First run uses `kamal setup`; it reuses the running kamal-proxy (same as Postaja prod on this host).
  If the run reports a proxy conflict, stop and do not change the proxy — the owner sends the log.
