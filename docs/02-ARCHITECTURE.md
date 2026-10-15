# Architecture

Status labels: **Live** · **Built** · **Planned**. Everything below is **Planned** (2026-10-15).

## Components
| # | Component | Purpose | Status |
|---|---|---|---|
| 1 | Web app (Next.js App Router, Tailwind, Inženirji.si design) | owner UI: today's list, company page, drafts to approve, projects, reports | Planned |
| 2 | API routes / server actions | CRUD, approvals, webhooks (Stripe, Meta lead forms, website form) | Planned |
| 3 | Job runner | long and scheduled work: prospecting, audits, mailbox sync, follow-ups, reports | Planned (ADR-003) |
| 4 | Agents (Claude API) | research summaries, classification, drafting, call-note extraction, report analysis | Planned |
| 5 | Headless browser | site audits (mobile test, speed, screenshots), on-demand mockups | Planned |
| 6 | Data store | companies, deals, audits, messages, drafts, projects, metrics | Planned (ADR-003) |

## Integrations
| Service | Use | Auth | Status |
|---|---|---|---|
| Google Places API | prospecting | API key | Planned |
| Mailbox (Gmail API or IMAP/SMTP) | sync replies, send approved drafts | OAuth / app password | Planned (mailbox open) |
| Google Calendar API | read bookings from appointment schedules | OAuth | Planned |
| Stripe | prepayment links, payment status | secret key + webhook | Planned |
| Meta Marketing API + Lead Ads | ad metrics, lead forms | system user token | Planned |
| GA4 Data API | traffic and conversions of inzenirji.si | OAuth / service account | Planned |
| Search Console API | search queries | OAuth / service account | Planned |
| Postaja | feed Inženirji.si brand materials | MCP / API | Planned |
| inzenirji-widget | editor usage per client site | internal API (to define) | Planned |

## Data model (first draft)
```
company (id, name, country, category, address, phone, website, place_id, rating, reviews, group A|B, score)
 ├─ contact (name?, email, email_source, phone, role)            -- only published or given addresses
 ├─ audit (dated snapshot: website checks, freshness issues, google profile, summary)
 ├─ competitor_link (company_id → competitor company_id, distance)
 ├─ deal (stage, source, owner, next_action_at, lost_reason, value_cents)
 │   ├─ activity (type: email|call|note|booking|stage_change, at, payload)
 │   ├─ draft (channel, body, status: pending|approved|sent|discarded, approved_at)
 │   ├─ proposal (scope, price_cents, materials_checklist, pdf_url, sent_at)
 │   └─ payment (kind: prepayment|final, amount_cents, provider_ref, paid_at)
 └─ project (checklist items, confirmed_at = guarantee start, pauses[], deadline, launched_at)
do_not_contact (email | domain | company_id, reason, at)            -- checked before every outbound draft
ad_metric / web_metric (date, source, dimensions, values)           -- daily snapshots
report (week, content, sent_at)
ai_usage (job, model, input/output tokens, cost_micro_eur)
```
Money in integer cents, AI cost in integer micro-euros.

## Safety
- One choke point for outbound: every send goes through `sendApprovedDraft()`, which re-checks approval and
  do-not-contact and enforces the daily cap.
- Owner-only access to the app (ADR-003 decides the mechanism).
- Secrets only in the hosting secret store; agents see variable names only.

## Environments
| Env | URL | Status |
|---|---|---|
| local | `localhost` | Planned |
| prod | `crm.inzenirji.si` (proposed), owner-only | Planned |
A separate dev environment is optional for an internal single-user tool; decide in ADR-003.
