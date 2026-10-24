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
