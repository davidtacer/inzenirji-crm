# TASK-016 — Weekly report + KPI dashboard

Status: **Built** (2026-10-16). Decision: ADR-040.

## Goal
Every Monday at 08:00 (Europe/Ljubljana) the owner gets an e-mail with last week's numbers and 3 proposals for the
coming week; `/porocila` shows any week with the KPI tiles from spec §6.

## Scope (this task)
- Week = Monday 00:00 to Monday 00:00, Ljubljana time (DST-safe).
- Numbers from the CRM only: new leads per source, researched companies, first e-mails, follow-ups, replies
  (without out-of-office and bounces), interested, opt-outs, bounces, calls (calendar events linked to a company +
  agreed call times), proposals sent/accepted (net value), sales in the month, payments marked by the owner,
  launches and how many were within the guarantee, demo funnel (editor stats via the demo key + demo leads), AI cost
  per job, Google Places calls, median time from a reply to our next e-mail, reply rate by category and offer group
  (first e-mails of the last 4 weeks).
- 3 proposals: Claude (job `weekly_report`), rules as fallback.
- Snapshot per week in `weekly_reports`; e-mail once (sent_at), retry a failed send after 1 h.
- Page: week navigation, KPI tiles, button "Pripravi predloge in pošlji na e-mail" (background job).

## Out of scope
Meta Ads, GA4, Search Console and CAC (TASK-015). Win/loss analysis (TASK-019).

## Proof
`src/server/reports/weekly.int.test.ts`: week bounds incl. DST, counts from seeded data, one e-mail per week with AI
proposals, rules + failed-send retry. Local screenshots of `/porocila` (desktop, phone).
