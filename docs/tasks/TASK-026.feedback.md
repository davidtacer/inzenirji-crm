# TASK-026 — feedback

## What I implemented
`src/server/companies/manual.ts` (prefill from HTML/URL, address/phone/website finders, `createManualCompany`),
`src/lib/prefill.ts` (shared form type, keeps server code out of the browser bundle), `/podjetja/novo` page, form and
actions, button on /podjetja, "already exists" notice on the company page.

## Test results
Unit 77/77 (+ bizi.si page prefill incl. ignoring bizi's own e-mail/links, own-site prefill with obfuscated e-mail,
s.p. without e-mail, address with house letter, URL without scheme, 404). Integration 48/48 (+ create with deal
`manual` and contact source, duplicate by phone returns the existing company, research + first draft possible,
validation).

## Deliberate breaks
Phone duplicate check disabled → int test fails (second company created) → restored.

## NOT RUN
Real bizi.si page (sandbox cannot open it); the form is editable, so a wrong read is corrected by hand.
