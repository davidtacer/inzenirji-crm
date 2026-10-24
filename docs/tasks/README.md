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
| TASK-012 | Google Calendar bookings + pre-call brief + call notes → proposal draft | 009, ADR-008, ADR-027 | C3 · 2026-12-05 | Part 1 Live (PR #45); part 2 Google Calendar sync (ADR-029) Live, owner connected his calendar 2026-10-16 (booking moved the deal to call_booked) |
| TASK-013 | Proposals (PDF), Stripe prepayment, payment status, invoices | 012, ADR-031 | C3 | Part 1 Live, owner-tested 2026-10-16 (proposal sent, client accepted, UPN QR via upnqr works); Stripe + invoices later; 2026-10-16 owner: no invoices/Stripe in the CRM, e-racuni.si instead (ADR-041) |
| TASK-014 | Projects: materials checklist, client uploads, reminders, guarantee clock | 013, ADR-010, ADR-033 | C3 | Done — Live (PR #61) |
| TASK-015 | Meta Ads + Search Console numbers in the weekly report, CAC and CPL (ADR-042); GA4 not installed on the site, so skipped | 016, ADR-042 | C4 · 2026-12-19 | Built |
| TASK-016 | Weekly report (Monday 08:00) + KPI dashboard: `/porocila`, snapshot per week, e-mail to the owner, 3 proposals (ADR-040). Ads/GA4/GSC numbers join with TASK-015; companies marked "Testno" (owner's own trials) are left out of every count | ADR-040 | C4 | Built |
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
| TASK-027 | Contextual AI reply drafts with one concrete next step (booking link / phone / ask for number) | 009, ADR-025 | C2 | Done — Live (PR #41) |
| TASK-029 | Full correspondence: Sent folder (owner's own e-mails), per-company history import, full-text conversation | 009, ADR-028 | C2 | Done — Live (PR #47) |
| TASK-030 | Companies list: search (name, city, category, address, domain, phone, e-mail), filters (stage, group, city, e-mail, own site, good business, min score), sort, presets, total | 005 | C2 | Done — Live (PR #51) |
| TASK-031 | Web search in research (Claude web search) + own verification, all links stored, e-mail candidates | 023, ADR-030 | C1 | Done — Live (PR #53) |
| TASK-032 | Editor demo leads (first part of TASK-011): POST /api/leads/demo with a key from Nastavitve, company + contact + deal (source editor_demo) + note with the requests, Danes funnel (visits → first edit → e-mail → call), company card; companies filter "Vir" + preset "Iz demota" + DEMO tag | 011, ADR-034 | C2 | Live (PR #63) |
| TASK-033 | Website inquiries (second part of TASK-011): inzenirji.si form → POST /api/leads/website (same key) → company/contact/deal `website_form`, stored as incoming message (Pogovor), deal replied, AI reply draft, owner e-mail | 011, 032, ADR-035 | C2 | Done — Live (PR #67, landing PR #30) |
| TASK-034 | AI researcher: always-on Claude web research like a salesperson on Google (own domain also from Instagram/Facebook bio, profiles with followers and bio, old builder sites, legal entity, people, services, facts for the personal e-mail), own verification, domain state (v izdelavi / parked), visible failure reason | 031, ADR-036 | C1 | Done — Live (PR #69, #71), owner-tested on Salon Fantazija |
| TASK-035 | Research as background jobs (no timeouts): `jobs` table, progress, auto-refreshing status; "v izgradnji" etc. recognised | 034, ADR-037 | C1 | Done — Live (PR #73) |
| TASK-036 | Nightly Claude researcher: MCP endpoint `/api/mcp/<key>` (research_queue, get_company, save_research), findings verified and analysed as a background job, key in Nastavitve, scheduled task on the owner's Claude account | 034, 035, ADR-038 | C1 | Built |
| TASK-037 | Google pregled (Gemini + Google Search): button on the company page, background job, answer shown unchanged with Search Suggestions, one-click save of e-mails/links/website, key + model in Nastavitve (ADR-039) | C1 | Built |
| TASK-038 | Smart search: activity + town lists with synonyms, city parts and nearby towns, skip queries of the last 90 days, adaptive paging, call budget, search history and unsearched towns on /iskanje | 005, ADR-047 | C1 | Built |
| TASK-028 | Owner settings page `/nastavitve` (sending switch, caps, booking link, phone, AI budget); env only for secrets | ADR-026 | C2 | Done — Live, owner-tested 2026-10-16 (PR #43) |
| TASK-039 | Site kickoff: "Začni izdelavo strani" (also by hand for companies not in the CRM, migrations and own sites): private repo from template, `BRIEF.md`, `CLAUDE.md`, editor config, assets, kickoff prompt, MCP project tools, stage tracking with owner gates | 014, 026, 036, 040, ADR-056 | C3 | Planned |
| TASK-040 | Site template repo (Next.js static export, blocks, schemas, `content/`, cookie notice + GA4, `export-schema`, `CLAUDE.md` template) per editor guide v1.2 | editor guide v1.2 | C3 | Planned |
| TASK-041 | Sites register "Strani": all sites on our system and editor with kind, stage, editor state, guide version (behind = migration candidate), daily plain-HTTP health checks, filters; "Registriraj obstoječo stran" for sites built before the kickoff | 039, ADR-057 | C3 | Planned |
