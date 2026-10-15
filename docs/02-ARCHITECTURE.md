# Architecture

Status labels: **Live** · **Built** · **Planned**. Everything below is **Planned** (2026-10-15).

## Components
| # | Component | Purpose | Status |
|---|---|---|---|
| 1 | Web app (Next.js App Router, Tailwind, Inženirji.si design) | owner UI: today's list, company page, drafts to approve, projects, reports | Planned |
| 2 | API routes / server actions | CRUD, approvals, webhooks (Stripe, Meta lead forms, website form) | Planned |
| 3 | Worker (pg-boss, same image, role `worker`) | long and scheduled work: prospecting, audits, mailbox sync, follow-ups, reports | Planned (ADR-011) |
| 4 | Agents (Claude API) | research summaries, classification, drafting, call-note extraction, report analysis | Planned |
| 5 | Headless browser | site audits (mobile test, speed, screenshots), on-demand mockups | Planned |
| 6 | PostgreSQL 16 (Kamal accessory `db` → `inzenirji-crm-db`, no published port) | companies, contacts, competitors, audits, deals, activities, drafts, do-not-contact (Built, TASK-003); projects, metrics, job queue (Planned) | Built (schema) |

## Integrations
| Service | Use | Auth | Status |
|---|---|---|---|
| Google Places API (New) Text Search | prospecting, daily cap `PLACES_DAILY_CALL_CAP` | API key | Built (TASK-005) |
| Mailbox `david@inzenirji.si` (IMAP sync + SMTP send) | sync replies, send approved drafts | mailbox password | Planned (ADR-013) |
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
- Owner-only access: Better Auth magic link, accounts only for e-mails in `OWNER_EMAILS`.
- Secrets only in the hosting secret store; agents see variable names only.

## Hosting (ADR-011)
```
internet ─► host nginx :80/:443 (certbot TLS, one server block per app)        shared VM 91.99.191.8
              ├─ asisto.app, portal.asisto.app …   (host PHP-FPM — not ours, never touch)
              └─ dev-postaja / peron.postaja.eu / crm.inzenirji.si ─► kamal-proxy 127.0.0.1:8080
                                                                        ├─ postaja (dev, prod)  — not ours
                                                                        └─ inzenirji-crm web ─┐
                                                   inzenirji-crm worker (pg-boss) ─────────────┤
                                                   inzenirji-crm-db (Postgres 16, kamal network) ◄┘
```
Deploy: GitHub Actions → Kamal over SSH with a dedicated deploy key (the agent sandbox cannot SSH).
Migrations run at web container start. Backups: nightly `pg_dump` to Hetzner Object Storage.

## Environments
| Env | URL | Status |
|---|---|---|
| local | `localhost:3000` + Postgres in Docker | Planned |
| prod | `https://crm.inzenirji.si`, owner-only | Live (app since 2026-10-15; database after the owner's `setup` run) |
One environment on the server is enough for an internal single-user tool; a dev destination can be added later.
