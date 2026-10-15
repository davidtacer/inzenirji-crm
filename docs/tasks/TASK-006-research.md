# TASK-006 — Research (v1, no AI, no browser)

## Goal
For each found company: what is wrong with its web presence (for the outreach remark), published e-mails with source,
group A/B, competitors — free and fast. Owner can research one company or 20 at a time.

## Scope
safe fetch with SSRF guards, HTML analysis, issues/group/summary, audit storage, contacts, competitor links, stage
found → researched, /podjetja (filters, batch button), /podjetja/[id] (summary, data, links, issues, e-mails,
competitors), sidebar "Podjetja" enabled, table links + group column, Slovenian labels.

## Out of scope (later tasks)
AI summary, screenshots and a real mobile test (worker + headless browser), distance-based competitors, lead scoring
(TASK-007).
