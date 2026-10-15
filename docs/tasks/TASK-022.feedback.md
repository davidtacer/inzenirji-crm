# TASK-022 — feedback

## What I implemented
Nearby Search + Place Details clients, distance, location/type columns (migration 0003), `findNearbyCompetitors()`
gated to good businesses with fallback to the database, competitor distances on the company page, cap 100,
A/B meaning everywhere (legend on /podjetja, labels "A · prenos" / "B · nova stran", tooltip, company summary).

## Test results
Unit `Tests 36 passed (36)` (+2: nearby request shape, distance), integration `Tests 25 passed (25)` (+2: good
business → details once, nearby, neighbours stored and nearest first, second run without details; weak business or
cap reached → database fallback with no Google call).

## Deliberate breaks
Removed the good-business gate → `FAIL … falls back to the database, no Google call` → restored → 25/25.

## NOT RUN
Real Google calls (sandbox has no internet) — verified on prod by the owner.
