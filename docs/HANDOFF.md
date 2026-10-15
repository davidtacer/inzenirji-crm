# Handoff — state as of 2026-10-15 13:10 (Europe/Ljubljana)

## Working mode
Not chosen yet for this repo. Until the owner decides: **mode A** (agent proposes, owner approves; agent pushes
branches and opens PRs only when asked). The editor repo (`inzenirji-widget`) runs in mode B — ask the owner
whether the same applies here.
Conversation with the owner in Slovenian; code and docs in English.

## Git and CI specifics
- Branches: `main` (initial docs commit), `dev` created from it as the working branch. Flow per DEVELOPMENT-RULES.
- `gh` GraphQL is blocked in cloud sessions: use REST (`gh api repos/davidtacer/inzenirji-crm/...`).
- No CI yet (TASK-001).

## Done
- 2026-10-15: repo created by the owner; docs foundation (manifest, product spec, architecture, ADR-001…010,
  task list) from the business plan `inzenirji.si/docs/nacrt-rasti.md`.

## Owner's open actions
- **ADR-003:** choose hosting/database/jobs (Cloudflare like the editor vs. a small server with Postgres).
- Choose the working mode for this repo (A or B).
- Which mailbox and sending domain the outreach uses (product spec §9).

## Next
TASK-001 scaffold once ADR-003 is decided, then the C1 phase (prospecting, research, scoring) — target 2026-11-07.

Latest TASK: 019 (planned) · latest ADR: 010.
