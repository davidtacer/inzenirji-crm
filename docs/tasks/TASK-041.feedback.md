# TASK-041 feedback (part 1: register existing sites)

Branch `feat/TASK-041-register-existing`.

## Proof
- `pnpm tsc --noEmit`, `pnpm lint`: clean.
- `pnpm test`: 154 passed. `pnpm test:int` (local Postgres 16, port 55432): 143 passed, including 2 new cases in `sites.int.test.ts` (register records handed_over + legacy + editors with zero GitHub calls; kickoff refused, input validated, duplicate site id refused).

## NOT RUN
- Real browser click-through of the new form on a deployed CRM.
- Reading real repos (vodniskuter.si, grant-si, inzenirji.si): by design the CRM does not read or write them.

## Deviations
- Part 1 only: no health checks, filters or "behind the guide" flag yet (rest of TASK-041).
- A `client` registration stores the start reason "Obstoječa stran, registrirana ročno." so the existing deposit rule does not block it.

## Part 1b (Cloudflare runbook, registered-site editing)
Branch `feat/TASK-041-cloudflare-runbook`.
- Proof: `tsc`, `lint` clean; `pnpm test` 156 passed; `pnpm test:int` 144 passed (new: editing a registered site; kickoff now writes `urls.dev = https://dev.vodniskuter.si`).
- Found live: Chrome shows "Did you mean vodniskuter.si? The site looks fake" for `dev-vodniskuter-si.<account>.workers.dev`; `dev.vodniskuter.si` opens without a warning (owner checked on a phone).
- NOT RUN: Cloudflare Pages flow (A) end to end for a new site; only the Workers flow (B) was done for real on vodniskuter.si.
