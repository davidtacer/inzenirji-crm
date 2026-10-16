# TASK-012 (part 1) — feedback

## What I implemented
Migration 0009 (`deals.call_at`, `brief`, `brief_at`, `call_summary`), `src/server/calls/calls.ts` (setStage, brief AI/rules,
call notes AI/notes, history, board), `src/lib/time.ts` (Ljubljana wall time ↔ Date), "Prodaja" box on the company page
(stage + call time + lost reason, brief, notes, history), page "Klici", sidebar, "Danes" calls block.

## Test results
Unit 84/84 (+ summer/winter wall time). Integration 53/53 (+ booked needs time, lost needs reason, follow-ups discarded,
booking activity, board; brief AI stored / bad answer → rules / no AI → rules, usage ok flags; notes AI summary with
package and materials, call_done, second notes without AI, history).

## Deliberate breaks
"Booked needs a time" check removed → calls test fails → restored. Lint caught `Date.now()` during render → moved to
`src/lib/time.ts` helpers.

## NOT RUN
Real Claude brief/notes calls — owner tries on prod.
