# TASK-012 part 2 (Google Calendar) — feedback

Owner 2026-10-16: prospect booked a call via the appointment schedule; CRM still said "dogovori termin"; connect Google.

## What I implemented
Migration 0011 (`google_accounts`, `calendar_events`), `src/server/google/` (AES-GCM token encryption, OAuth helpers,
calendar list/apply/sync, unmatched bookings), routes `/api/google/connect` and `/api/google/callback`, Nastavitve
section (connect / status / disconnect), Klici sync on load + unknown bookings with "+ dodaj podjetje", e-mail prefill
on /podjetja/novo, deploy secrets.

## Test results
Unit 87/87 (+ encryption, state signature/expiry, auth URL). Integration 58/58 (+ booking → call_booked, moved,
cancelled → replied; own events / past / unknown; sync with refresh + bearer token, throttle, expired grant message).

## Deliberate breaks
Self/owner attendee filter removed → solo events counted, test fails → restored.

## NOT RUN
Real Google consent and Calendar API (needs the owner's OAuth client) — owner connects in Nastavitve.
