# TASK-008 — feedback

## What I implemented
`src/server/outreach/compose.ts` (texts, HTML), `unsubscribe.ts` (signed token), `drafts.ts` (create, follow-ups,
approve, discard, replied, block, add e-mail), `send.ts` (the only send path), migration 0005 (`draft_kind`, one live
draft per deal and step), `/osnutki` page, company "Stik in e-mail" box, "Danes" button and draft marker,
`/api/odjava`, outreach mailer, deploy config (`OUTREACH_*`, locked by default).

## Test results
Unit: compose + token tests added (7). Integration: outreach 6/6 — full sequence day 0 → 3 → 8 and stop; not
approved / locked refused; cap 2 with three parallel sends → exactly 2 sent, third next day; DNC before draft and at
send time (draft discarded); SMTP failure keeps draft approved; manual e-mail needs a source; replied and blocked stop
the sequence; database rejects a second live draft for the same step.

## Deliberate breaks
1. DNC check in `sendApprovedDraft` disabled → `expected { ok: true } to deeply equal { ok: false, error: 'BLOCKED' }` → restored.
2. Advisory lock removed → first the race test still passed (sends too fast to overlap); test fixed with a slow mailer → `expected [ … ] to have a length of 2 but got 3` → restored → 6/6.

## NOT RUN
Real SMTP send from `david@inzenirji.si` (locked until DKIM; no secret in the sandbox). Browser screenshots
(sandbox cannot log in) — owner checks on prod.
