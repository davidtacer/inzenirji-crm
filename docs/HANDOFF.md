# Handoff — state as of 2026-10-15 13:10 (Europe/Ljubljana)

## Working mode
Mode B (autonomous), standing permission 2026-10-15 — owner's words: "Način dela: B (avtonomno kot pri
urejevalniku)" (ADR-012). Agent commits on `feat/*`, `fix/*`, `docs/*`, opens PRs to `dev`, merges only on green CI.
Ask the owner only for: secrets, accounts, server and DNS steps, product decisions, prod, irreversible steps.
Conversation with the owner in Slovenian; code and docs in English.

## Git and CI specifics
- Branches: `main` (initial docs commit), `dev` created from it as the working branch. Flow per DEVELOPMENT-RULES.
- `gh` GraphQL is blocked in cloud sessions: use REST (`gh api repos/davidtacer/inzenirji-crm/...`).
- No CI yet (TASK-001).

## Done
- 2026-10-15: repo created by the owner; docs foundation (manifest, product spec, architecture, ADR-001…010,
  task list) from the business plan `inzenirji.si/docs/nacrt-rasti.md`.

- 2026-10-15: owner decisions → ADR-011 shared Hetzner VM (Kamal, host nginx edge, own Postgres accessory),
  ADR-012 mode B, ADR-013 outreach from `david@inzenirji.si`. Server facts taken from `DataVallis/postaja` docs
  (CHEATSHEET, ADR-025/027/084, `config/deploy.dev.yml`, `ops/nginx/`).

## Shared server — read before any deploy work
VM `91.99.191.8`, user `deploy`, also runs asisto (host PHP-FPM behind nginx), Postaja dev + prod (Kamal) and later
volil.si. Only add our own Kamal service, accessory, volume and nginx server block (manifest "Shared server").
The agent sandbox cannot SSH there (egress proxy); every host step is an owner action from a runbook.

## Owner's open actions (before the first deploy, TASK-002)
1. DNS: `A crm.inzenirji.si → 91.99.191.8` (Cloudflare, proxy off/"DNS only" so certbot can issue the cert).
2. Install `ops/nginx/crm.inzenirji.si.conf` on the host (commands in the file header), then certbot.
3. Mailbox `david@inzenirji.si`; SPF, DKIM and DMARC for `inzenirji.si` (ADR-013) — before the first outreach send.
4. GitHub environment `prod` secrets for this repo (names in CHEATSHEET) + a dedicated deploy SSH key.

## Next
TASK-001 scaffold (Next.js + Tailwind + Drizzle + Postgres in Docker locally, CI), TASK-002 Kamal deploy skeleton, then the C1 phase (prospecting, research, scoring) — target 2026-11-07.

Latest TASK: 019 (planned) · latest ADR: 013.
