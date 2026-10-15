# TASK-025 — feedback

## What I implemented
`src/server/directories/bizi.ts` (address key, search URL, result parsing, company page e-mails, `lookupBizi`),
research integration (`directories` flag on in prod actions, `AUDIT_VERSION = 3`), company page row, action message.

## Test results
Unit 69/69 (+ address parsing, result filtering by street/number/post, ignoring bizi's own e-mail, two companies at
one address resolved by name and by phone, no safe match → nothing, non-SI skipped). Integration 40/40 (+ no own site →
bizi search → e-mail with bizi source; directories off → no request).

## Deliberate breaks
House number check removed → `expected [ …(3) ] to deeply equal [ …(2) ]` and an unsafe match accepted → restored.

## NOT RUN
Real bizi.si pages (sandbox cannot open them; markup assumed from the owner's pasted results: link to
`https://www.bizi.si/SLUG/` followed by street and "post city"). If prod shows "ni najdeno" for a company the owner
can find by hand, the parser needs the real HTML.
