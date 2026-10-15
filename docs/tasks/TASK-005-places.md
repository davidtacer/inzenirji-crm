# TASK-005 — Prospecting with Google Places

## Goal
The owner searches "category + place" in the CRM; results are stored as companies with a `found` deal, without
duplicates, within a hard daily cap of paid calls.

## Scope
- Places API (New) Text Search, field mask limited to stored fields, region SI, language sl, up to 3 pages × 20.
- Mapping (closed businesses dropped, rating × 10, city from address components).
- Dedupe: place id → else website domain or phone digits on a company without place id → else insert; deal
  `found`/`places_search` only for companies without one; existing deals untouched.
- Daily cap per provider (`api_calls`, atomic reserve, reset at local midnight), `PLACES_DAILY_CALL_CAP` (default 50).
- UI: `/iskanje` (form, result message, usage today, latest 50 companies), home counters, header navigation.
- Deploy: `GOOGLE_PLACES_API_KEY` secret, cap variable.

## Acceptance criteria
Unit + integration tests green (mapping, request shape, error hygiene, dedupe, cap incl. concurrency); after deploy the
owner runs one real search and sees companies in the table.
