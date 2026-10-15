# Handoff — state as of 2026-10-15 13:50 (Europe/Ljubljana)

## Working mode
Mode B (autonomous), standing permission 2026-10-15 — owner's words: "Način dela: B (avtonomno kot pri
urejevalniku)" (ADR-012). Agent commits on `feat/*`, `fix/*`, `docs/*`, opens PRs to `dev`, merges only on green CI.
Ask the owner only for: secrets, accounts, server and DNS steps, product decisions, prod, irreversible steps.
**Owner's standing rule (2026-10-15):** every time the owner has to do something himself (server, DNS, GitHub
settings, secrets, accounts), write out **every step**: exact commands to copy, where to click, what he should see,
and what to do if it fails — even if it was explained before. He does not do these things often.
**Merging:** the owner gave permission to merge own PRs on green CI (2026-10-15: "maš dovoljenje od moje strani,
da lahko mergaš sam"). If the session's permission layer still denies a merge, tell him and he merges.
Conversation with the owner in Slovenian; code and docs in English.

## Git and CI specifics
- Branches: `main` (initial docs commit), `dev` created from it as the working branch. Flow per DEVELOPMENT-RULES.
- `gh` GraphQL is blocked in cloud sessions: use REST (`gh api repos/davidtacer/inzenirji-crm/...`).
- No CI yet (TASK-001).

## Done
- 2026-10-15: repo created by the owner; docs foundation (manifest, product spec, architecture, ADR-001…010,
  task list) from the business plan `inzenirji.si/docs/nacrt-rasti.md`.

- 2026-10-15: TASK-003 data model built (PR open): 8 tables, startup migrations, DB health, do-not-contact.
- 2026-10-15: TASK-002 deploy skeleton merged (PR #4). First deploy = owner step below.
- 2026-10-15: TASK-001 scaffold merged (PR #3, CI green).
- 2026-10-15: owner merged PR #1 (docs ADR-011..013).
- 2026-10-15: owner decisions → ADR-011 shared Hetzner VM (Kamal, host nginx edge, own Postgres accessory),
  ADR-012 mode B, ADR-013 outreach from `david@inzenirji.si`. Server facts taken from `DataVallis/postaja` docs
  (CHEATSHEET, ADR-025/027/084, `config/deploy.dev.yml`, `ops/nginx/`).

## Shared server — read before any deploy work
VM `91.99.191.8`, user `deploy`, also runs asisto (host PHP-FPM behind nginx), Postaja dev + prod (Kamal) and later
volil.si. Only add our own Kamal service, accessory, volume and nginx server block (manifest "Shared server").
The agent sandbox cannot SSH there (egress proxy); every host step is an owner action from a runbook.

## Owner's open actions
Done by the owner 2026-10-15 ("sem uredil vse"): DNS `crm.inzenirji.si`, nginx server block + certbot on the host,
mailbox `david@inzenirji.si`, GitHub environment `prod` (secrets + variables per CHEATSHEET) and the deploy key.
Seen from the agent (DNS over HTTPS): SPF `v=spf1 +a +mx ~all`, DMARC `p=none`. Not verifiable from the sandbox:
DKIM and MX → owner ran mail-tester.com on 2026-10-15: **9/10**. SPF pass (sending server `gateone.datavallis.com`,
78.46.239.231), DMARC pass, not blocklisted, **DKIM missing** (−1). TASK-008 (first outreach send) is **blocked until
DKIM signs mail from `david@inzenirji.si`** (ADR-013); re-test must show "Your message is signed with DKIM".

## First deploy (owner, once TASK-002 is merged to `dev`)
1. Promote `dev` → `main`: GitHub → Pull requests → New pull request → base `main`, compare `dev` → Create → Merge.
   This starts "Deploy prod" automatically; the first automatic run fails at deploy (no database yet) — expected.
2. GitHub → Actions → "Deploy prod" → Run workflow → branch `main` → tick **setup** → Run workflow.
3. Green run ends with `{"status":"ok","sha":"…"}` in "Smoke check". If it fails, send the log; never change the
   kamal-proxy settings on the host.

## Local Postgres for integration tests
`TEST_DATABASE_URL` must point to a real Postgres 16; tests drop and recreate the `public` schema, so use a
throwaway database. In the cloud sandbox: `initdb` as user postgres in `/var/tmp/crm-pg`, port 55432, then
`TEST_DATABASE_URL=postgres://crm@127.0.0.1:55432/crm_test pnpm test:int`.

## Next
TASK-001 scaffold (Next.js + Tailwind + Drizzle + Postgres in Docker locally, CI), TASK-002 Kamal deploy skeleton, then the C1 phase (prospecting, research, scoring) — target 2026-11-07.

Latest TASK: 019 (planned) · latest ADR: 014.
