# TASK-013 (part 1) — feedback

## What I implemented
Migration 0013 (`proposals`, `proposal_status`), `src/server/proposals/` (totals, item parsing, create from call summary,
update, e-mail as threaded reply draft, public open with view counting, accept, lists; UPN QR text + SVG), seller
settings (name, street, city, tax id, VAT payer, IBAN mod-97, validity), owner pages `/ponudbe` and `/ponudbe/[id]`,
public `/ponudba/[token]` with accept form and print button, "Ponudba" in the Prodaja box, sidebar, new dependency
`qrcode` (QR rendering; small, maintained, no native code).

## Test results
Unit 92/92 (+ totals with/without VAT, Slovenian number parsing, UPN field layout and checksum, ISO-8859-2, IBAN).
Integration 63/63 (+ B flow: draft hidden from client, seller details required, threaded reply draft with link and
gross amount, proposal_sent, client views counted without owner, accept with name, locked after acceptance, won;
A flow: price required, edit validation, expired proposal refused). Visual check: public page rendered locally
(desktop + mobile) — found and fixed invisible intro (`text-base` is a colour token in our theme) and a wrapping total.

## Deliberate breaks
Draft visible to clients → `expected { p: … } to be null` → restored.

## NOT RUN
Scanning the UPN QR with a real Slovenian banking app — owner checks with his bank app before the first real proposal.
