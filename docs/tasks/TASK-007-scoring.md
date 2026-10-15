# TASK-007 — Lead scoring and "today's top 10"

Goal: every researched company gets a score 0–100 with a visible reason per part; the home screen shows the
10 best leads to contact today (ADR-018).

## Acceptance
- `scoreLead()` pure function, four parts (business, opportunity, gap, reach), do-not-contact → 0.
- Score and breakdown stored on `companies` (`score`, `score_parts`, migration 0004) right after research.
- Companies researched before this task are scored once when "Danes" opens.
- "Danes": top 10 in stage `researched`, score > 0, ordered by score; shows score, group A/B, e-mail yes/no, summary.
- Company list: "Točke" column, list sorted by score. Company page: breakdown box.
- Unit + integration tests; a deliberate break is caught.
