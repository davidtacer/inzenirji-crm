# TASK-008 — Drafts, approval queue, outreach sequence

Goal: the CRM prepares the first e-mail and two follow-ups for the best leads; the owner edits and approves;
approved e-mails are sent from `david@inzenirji.si` through one guarded function (ADR-004, ADR-007, ADR-013, ADR-019).

## Acceptance
- "Danes": button prepares day-0 drafts for the top 10 (skips: no e-mail, do-not-contact, already drafted, later stage).
- Company page: prepare first e-mail, add a published e-mail with its source, mark "odgovoril", "ne kontaktiraj" (confirmed, permanent).
- "Osnutki": pending (edit subject/body, approve, discard), approved (send, edit again), sent (last 30); lock banner and today's count/cap.
- Follow-ups day 3 and day 8 are drafted automatically when due (on opening "Osnutki"), only after the previous step was sent.
- `sendApprovedDraft()`: enabled, approved, not blocked (else discard), daily cap under a lock, List-Unsubscribe headers,
  deal → `contacted`, next action date, activity `email_out`. Failed SMTP leaves the draft approved.
- `/api/odjava`: signed token, GET confirm page, POST adds e-mail to do-not-contact.
- Sending stays **locked** in prod until the owner sets `OUTREACH_SMTP_PASSWORD` and `OUTREACH_ENABLED=1` after DKIM passes.

## Not in this task
Mailbox sync and reply classification (TASK-009), bounce-rate stop (needs bounces from TASK-009), AI-written remarks.
