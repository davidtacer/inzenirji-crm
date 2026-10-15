# Handoff — state as of 2026-10-15 13:50 (Europe/Ljubljana)

## Working mode
Mode B (autonomous), standing permission 2026-10-15 — owner's words: "Način dela: B (avtonomno kot pri
urejevalniku)" (ADR-012). Agent commits on `feat/*`, `fix/*`, `docs/*`, opens PRs to `dev`, merges only on green CI.
Ask the owner only for: secrets, accounts, server and DNS steps, product decisions, prod, irreversible steps.
**Owner's standing rule (2026-10-15):** every time the owner has to do something himself (server, DNS, GitHub
settings, secrets, accounts), write out **every step**: exact commands to copy, where to click, what he should see,
and what to do if it fails — even if it was explained before. He does not do these things often.
**Production:** since 2026-10-15 the agent also promotes `dev` → `main` and verifies the deploy (ADR-016).
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

- 2026-10-15: TASK-007 lead scoring 0–100 + "Danes" top 10 (ADR-018) built (PR open).
- 2026-10-15: TASK-022 nearby competitors (ADR-017) + A/B legend built (PR open). Cap 100.
- 2026-10-15: TASK-006 research v1 Live. Favicons: CRM `>I` live; editor `I_` on widget dev (PR #21 there).
- 2026-10-15: TASK-021 sidebar layout (owner request with TeleCRM reference) built (PR open).
- 2026-10-15 16:54: TASK-005 Live on prod, owner-tested (search "frizerski salon Celje" filled the table). Built earlier: owner set `GOOGLE_PLACES_API_KEY` (restricted to the server IP) 16:34.
- 2026-10-15 16:27: **TASK-020 login Live on prod, owner-tested** — owner set `SMTP_PASSWORD`, promoted, requested a link, received it from hello@inzenirji.si and is signed in.
- 2026-10-15 16:07: owner ran `setup` (DB booted) and promoted TASK-003; prod health `{"status":"ok","sha":"e650f24…","db":"ok"}`. **Live.**
- 2026-10-15: TASK-003 data model merged (PR #7, CI green incl. container + migrations): 8 tables, startup migrations, DB health, do-not-contact.
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

## Production state
- 2026-10-15 15:52: owner promoted `dev` → `main` (PR #6); automatic "Deploy prod" run 38746379019 green; smoke check
  served `ce9b738` (TASK-002 app, no database yet). `https://crm.inzenirji.si/api/health` →
  `{"status":"ok","sha":"ce9b738…"}`. **Live on prod** (app only).
- 2026-10-15 16:07: database booted by the owner's `setup` run; TASK-003 live, health `db: ok` (sha e650f24).
- (History) The database accessory was not booted by the first automatic run (it skips `setup`). From TASK-003 on the app needs it
  (migrations at start, `db` in health), so the owner runs `setup` **before** promoting TASK-003:
  1. Actions → "Deploy prod" → Run workflow → branch `main` → tick **setup** → Run (boots `inzenirji-crm-db`,
     redeploys the same version).
  2. Then promote `dev` → `main` as before; the automatic run applies migrations and the smoke check needs `db: ok`.

## Local Postgres for integration tests
`TEST_DATABASE_URL` must point to a real Postgres 16; tests drop and recreate the `public` schema, so use a
throwaway database. In the cloud sandbox: `initdb` as user postgres in `/var/tmp/crm-pg`, port 55432, then
`TEST_DATABASE_URL=postgres://crm@127.0.0.1:55432/crm_test pnpm test:int`.

## Next
TASK-001 scaffold (Next.js + Tailwind + Drizzle + Postgres in Docker locally, CI), TASK-002 Kamal deploy skeleton, then the C1 phase (prospecting, research, scoring) — target 2026-11-07.

Latest TASK: 022 (in progress: 007) · latest ADR: 018. Next: TASK-008 drafts + approval queue (sending blocked on DKIM). Local Postgres for int tests may stop when the sandbox restarts — restart with `pg_ctl` (see above).
