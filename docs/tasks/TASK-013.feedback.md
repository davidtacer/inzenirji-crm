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

## Fix 2026-10-16 (owner report)
"Pripravi e-mail s ponudbo" answered "Osnutek odgovora … že obstaja" with nothing in Osnutki: the one-reply-per-message
index counted the already **sent** reply. Index now covers only open drafts (pending/approved), migration 0014.
Regression test added (sent reply to the same message, proposal e-mail still created); with the old predicate it fails.

## Fix 2026-10-16: UPN QR did not scan (owner report)
Owner: "QR koda ni pravilna, ne dela z našimi bankami, uporabi upnqr". Our encoder wrote the reference with a space
("SI00 57308522"). The data string now comes from the `upnqr` package (1.2.2, ISC, no dependencies); reference without
spaces; due date at noon UTC (no day shift). Unit test decodes the string with `upnqr.decode`. Independent check:
QR rendered to PNG and read back with jsQR → version 15, bytes identical, ISO-8859-2 (Ž). Still to confirm by the
owner with a real banking app.
