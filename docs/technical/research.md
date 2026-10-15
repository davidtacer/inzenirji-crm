# Research (TASK-006) — Built

How a company is researched today (`src/server/research/`).

1. `websiteKind()` decides own site / social profile / link page / none.
2. Own site → `safeFetch()`: http(s) only, ports 80/443, no credentials, every hop's host resolved and refused if any
   address is private (RFC 1918, loopback, link-local incl. 169.254.169.254, CGNAT, ULA, multicast), max 5 redirects,
   10 s, 2 MB. **Residual risk:** DNS rebinding between our lookup and fetch's own lookup — acceptable for an
   owner-only tool; pin the IP with an undici dispatcher if the CRM ever gets more users.
3. `analyzeHtml()` (pure): CMS (generator meta or fingerprints), copyright year, viewport, title/description/H1,
   JSON-LD and LocalBusiness, e-mails (mailto + text, junk filtered), social links (share links ignored), tel: numbers.
4. `findIssues()` → Slovenian issues with severity; `proposeGroup()` (A = reachable own site, else B); `summarize()`.
5. `runAudit()` stores an `audits` row, sets `companies.offer_group`, inserts e-mails as contacts with the fetched page
   as `email_source` (ADR-007), links up to 5 competitors (same city + category in our DB, by rating × reviews),
   moves the deal `found → researched` (never touches later stages).
6. `researchBatch()`: up to 20 `found` companies, 3 at a time, from the owner's button on /podjetja.

Not yet: AI summary, screenshots/real mobile test (headless browser in the worker), nearest competitors by distance.
