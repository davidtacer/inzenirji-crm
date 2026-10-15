# TASK-007 — feedback

## What I implemented
`src/server/scoring/score.ts` (pure scoring, ADR-018), `src/server/scoring/apply.ts` (`rescoreCompany`,
`rescoreMissing`, `topLeads`, `companyBlocked` — DNC by company, website domain, contact e-mails and their domains),
migration 0004 `companies.score_parts`, scoring at the end of `runAudit`, "Danes" top 10, "Točke" column (lists
sorted by score), score breakdown box on the company page, `ScoreBadge` (green ≥ 60, yellow 40–59).

## Test results
Unit `Tests 41 passed (41)` (+5 scoring). Integration `Tests 27 passed (27)` (+2: top list order, contacted and
blocked companies excluded, DNC domain → 0, backfill runs once; unresearched → null; research run stores score + parts).

## Deliberate breaks
`doNotContact: false` in `rescoreCompany` → `expected [ 'Močan', 'Blokiran', 'Šibek' ] to deeply equal [ 'Močan', 'Šibek' ]` → restored → 2/2.

## NOT RUN
Browser screenshot of the new screens (sandbox login not available) — checked by the owner on prod.
