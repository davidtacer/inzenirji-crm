# TASK-009 — Mailbox sync, reply classification, reply drafts

## Acceptance
- IMAP read-only sync of INBOX from the last UID; on "Odgovori" open (≥ 2 min apart) and by button.
- Only mail matched to a company is stored (thread id, known contact, own domain); duplicates ignored.
- Classification: rules (bounce, out of office, no/odjava) then Claude Haiku; fallback question.
- Effects per class (ADR-023); reply drafts for interested/question/not now in "Osnutki", threaded on send.
- Sent e-mails carry our Message-ID; follow-ups thread to the first e-mail; replies exempt from the cold cap.
- Bounce stop for cold e-mails (> 3 % of ≥ 20 in 7 days).
- Company page shows the conversation; sidebar "Odgovori".
- Upgrade migration keeps existing drafts.
