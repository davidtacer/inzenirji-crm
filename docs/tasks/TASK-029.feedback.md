# TASK-029 — feedback

Owner 2026-10-16: wants to see his own e-mails in the CRM, not only replies; e-mailed Fizis by hand before adding it.

## What I implemented
Migration 0010 (`direction`, `to_emails`, classification nullable + checks), `processSent`, `matchAddress`,
`processInbound(effects:false)`, IMAP refactor (Sent folder, per-folder UID state, `fetchHistory`), `importCompanyHistory`,
history button + automatic import after manual entry / added e-mail, full-text conversation, Odgovori only incoming.

## Test results
Unit 84/84 (+ To/Cc parsing). Integration 55/55 (+ Sent mail stored/contacted, CRM-sent and private mail skipped,
not on Odgovori; history both directions without effects, search terms = contact + own domain, replied stage).

## Deliberate breaks
Effects applied during history import → `ne` blocked the company, test fails → restored.

## NOT RUN
Real IMAP Sent folder name and search on the mail server — owner clicks "Uvozi korespondenco" on Fizis.
