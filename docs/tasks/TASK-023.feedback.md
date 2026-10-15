# TASK-023 — feedback

## What I implemented
`extractEmails`, `decodeCfEmail`, `contactLinks`, `pageText`, `rankEmails` (analyze.ts), `hours.ts` (site parser, Google
periods, mismatch sentence), `placeProfile` (client.ts), runAudit crawl + profile + new issues + `data.v = 2`,
deepen batch + `shallowCount`, closed → score 0, hours remark in compose, UI (Danes button, Google box, scanned pages).

## Test results
Unit 58/58 (+ e-mail spellings, Cloudflare, contact links, ranking, hours parsing/merging/mismatch, hours remark).
Integration 36/36 (+ crawl of contact/about pages with per-page source and hidden e-mails, hours mismatch from a fake
Google profile, reviews without empty ones, closed → 0, deepen re-runs only old audits; TASK-022 test updated: each
research now makes one profile call + nearby).

## Deliberate breaks
Contact pages disabled (max 0) → `expected [ 'https://salon-ana.si/', …(1) ] to deeply equal [ …(2) ]` → found that
max 0 still returned one link → fixed the limit check → restored → 9/9.

## NOT RUN
Real sites and real Google calls (sandbox has no internet) — owner runs "Poglobi raziskavo" on prod.
