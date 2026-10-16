# Tasks

Phases follow the business plan (`inzenirji.si` → `docs/nacrt-rasti.md` §7.5). Specs are written when a task starts.

| Task | Title | Depends on | Phase / target | Status |
|---|---|---|---|---|
| TASK-001 | Scaffold: Next.js + Tailwind (Inženirji.si tokens), lint/typecheck/test/build, CI | ADR-002 | C1 · 2026-10-24 | Done (PR #3) |
| TASK-002 | Deploy skeleton: Dockerfile, Kamal (`prod`), GitHub Actions deploy, health on crm.inzenirji.si | 001, ADR-011, ADR-014 | C1 | Done — Live on prod (PR #4, deploy run 38746379019) |
| TASK-003 | Data model + migrations (company, contact, audit, deal, activity, draft, do_not_contact) | 001 | C1 | Done — Live on prod (PR #7, health `db: ok` e650f24) |
| TASK-004 | Import existing leads (Google Sheets + `processed.txt` history) | 003 | C1 | Planned |
| TASK-005 | Prospecting: Google Places search by region × category, dedupe, daily cap | 003 | C1 · 2026-11-07 | Done — Live on prod, owner-tested (PR #13) |
| TASK-006 | Due diligence: site audit, freshness vs. Google profile, competitors, summary, group A/B | 005 | C1 | Done — Live (v1: no AI, no browser; PR #23) |
| TASK-007 | Lead scoring + "today's top 10" home screen | 006, ADR-018 | C1 | Done — Live on prod (PR #27/#28) |
| TASK-008 | Drafts + approval queue; outreach sequence (day 0/3/8); do-not-contact; send cap | 007, ADR-004, ADR-007, ADR-019 | C2 · 2026-11-21 | Done — Live on prod (PR #29/#30), sending locked until DKIM |
| TASK-009 | Mailbox sync, reply matching and classification, reply drafts | 008, ADR-023 | C2 | Done — Live on prod (PR #37) |
| TASK-010 | Mockup module (on demand, owner-started) | 006, ADR-005 | C2 | Planned |
| TASK-011 | Inbound leads: website form, Meta lead forms, demo sign-ups, site-audit requests | 003 | C2 | Planned |
| TASK-012 | Google Calendar bookings + pre-call brief + call notes → proposal draft | 009, ADR-008 | C3 · 2026-12-05 | Planned |
| TASK-013 | Proposals (PDF), Stripe prepayment, payment status, invoices | 012 | C3 | Planned |
| TASK-014 | Projects: materials checklist, client uploads, reminders, guarantee clock | 013, ADR-010 | C3 | Planned |
| TASK-015 | Meta Ads metrics + GA4 + Search Console daily snapshots | 003 | C4 · 2026-12-19 | Planned |
| TASK-016 | Weekly report (Monday 08:00) + KPI dashboard | 015 | C4 | Planned |
| TASK-017 | Postaja feed for the Inženirji.si brand from finished projects | 014, ADR-006 | C5 · 2027-01 | Planned |
| TASK-018 | After-launch flow: review/NPS/referral requests, editor-usage upsells (incl. Postaja for clients) | 014 | C5 | Planned |
| TASK-019 | Win/loss analysis | 016 | C5 | Planned |
| TASK-020 | Owner-only login: Better Auth magic link, login page, logout, protected pages | 003, ADR-015 | C1 | Done — Live on prod, owner-tested (PR #10) |
| TASK-021 | App shell: sidebar menu, full width (owner's reference); own site vs. social/link pages | 005 | C1 | Done — Live on prod (PR #15) |
| TASK-022 | Nearby competitors from Google for good businesses; location/type stored; A/B legend | 006, ADR-017 | C1 | Done — Live on prod (owner-tested) |
| TASK-023 | Deep research: contact/about pages, hidden e-mails with source, Google profile (hours, summary, reviews), hours mismatch, re-research old audits | 006, ADR-020 | C1 | Done — Live on prod (PR #31) |
| TASK-024 | AI personal remark (Claude API) from site text + Google reviews, cost logged, daily budget | 023, ADR-021 | C2 | Done — Live on prod (PR #33) |
| TASK-025 | E-mails from the public directory bizi.si by address, with source (AJPES, CompanyWall, social pages: not now) | 023, ADR-007, ADR-022 | C2 | Done — Live on prod (PR #35) |
| TASK-026 | Manual company entry: paste a bizi.si or website URL → prefilled form → save + research | 005, ADR-024 | C2 | Done — Live, owner-tested 2026-10-16 (sent to himself, reply classified) |
| TASK-027 | Contextual AI reply drafts with one concrete next step (booking link / phone / ask for number) | 009, ADR-025 | C2 | Built — PR open |
