# TASK-009 — feedback

## What I implemented
`src/server/mailbox/` (classify, process, reply, imap, sync), migration 0007 (reply_class, inbound_messages,
mailbox_state, drafts.message_id / in_reply_to, draft_kind recreated with `reply`, indexes), send threading +
bounce stop + replies outside the cap, follow-up threading, placeholder guard on approval, "Odgovori" page,
conversation box, sidebar, `BOOKING_URL` variable, `serverExternalPackages` for imapflow/mailparser.

## Test results
Unit 73/73 (+ quoted-text cutting, rules, AI/fallback classification, raw RFC 822 parsing). Integration 46/46
(+ question reply by thread → replied, follow-ups stopped, reply draft with placeholder that blocks approval, duplicate
ignored, threaded reply send outside the cap; contact/domain matching, unknown sender not stored; no → DNC + lost,
not now → nurture +90 d, out of office only logged, AI usage logged; bounce via our Message-ID → DNC, bounce stop at
1/20; follow-up threaded; upgrade 0006 → 0007 with existing drafts).

## Deliberate breaks
Unknown senders stored (fallback match) → `expected 3 to be 2` → restored. Earlier, a real bug found by tests: the
first index predicate used `kind::text` → Postgres "functions in index predicate must be marked IMMUTABLE" → enum
recreated in the migration instead.

## NOT RUN
Real IMAP login to `david@inzenirji.si` (sandbox has no network/secret) — owner opens "Odgovori" on prod; the page
shows "Nabiralnik nazadnje prebran: …" or the error.
