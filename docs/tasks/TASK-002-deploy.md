# TASK-002 — Deploy skeleton: Docker, Kamal, Deploy prod workflow

## Goal
`https://crm.inzenirji.si/api/health` serves the exact deployed commit, deployed by GitHub Actions with Kamal to the
shared Hetzner VM without touching anything that is not ours (ADR-011, ADR-014).

## Scope
1. `Dockerfile` (standalone Next.js, non-root, healthcheck), `.dockerignore`.
2. `config/deploy.yml` + `.kamal/secrets`: service `inzenirji-crm`, Postgres 16 accessory `db`, memory limits,
   kamal-proxy host `crm.inzenirji.si` behind host nginx (`ssl: false`, `forward_headers: true`).
3. `.github/workflows/deploy-prod.yml`: on push to `main` and by hand (`setup` input for the first run),
   settings check (names only), pinned host key, smoke check on the exact SHA.
4. CI: Docker build + container health.

## Must not touch
Other apps, nginx blocks other than ours, kamal-proxy boot config, secrets values.

## Acceptance criteria
CI green including the container health step; after the owner's first `setup` run, the smoke check passes.
