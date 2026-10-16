# Manifest — rules for agents

Read `docs/DEVELOPMENT-RULES.md` before any task. This file only adds what is specific to this repo.
ADRs in `docs/03-DECISIONS.md` override both files.

## What this repo is
The internal AI CRM ("prodajni booster") for Inženirji.si. It finds and researches prospects, keeps the sales
pipeline, drafts outreach and follow-ups, books calls, prepares proposals and payments, runs onboarding of new
clients (materials checklist, 7-day guarantee clock), and reports on ads and site traffic. It is used by the owner
only (one internal user, more later). The business plan behind it: `inzenirji.si` repo, `docs/nacrt-rasti.md`.

Related repos:
- `davidtacer/inzenirji.si` — public landing site (lead forms, demo entry points, /urejevalnik).
- `davidtacer/inzenirji-widget` — conversational site editor (Urejevalnik); its usage data feeds upsell triggers.

## Roles
- Owner: David Tacer (product decisions, accounts, secrets, hosting, sending domains, prod).
- CTO + implementer: AI agent; working mode in HANDOFF.

## Configuration (ADR-026)
Anything the owner may want to change (switches, limits, links, texts) is a setting in the CRM (`/nastavitve`, table `settings`).
Environment variables only for secrets and infrastructure. Never ask the owner to set a GitHub variable for a business setting.

## Never
- Never put a secret (Anthropic key, Google OAuth secrets, Places API key, Meta token, Stripe key, SMTP password)
  in the repo, chat, logs, fixtures or screenshots. Name the variable, the owner pastes the value.
- **Never send anything to a prospect or client without the owner's approval** (e-mails, replies, follow-ups,
  proposals, posts). Everything outbound is a draft until the owner approves it (ADR-004). Auto-send may be enabled
  later per category by an ADR, never by default.
- Never contact anyone on the do-not-contact list, in any channel. Opt-outs are permanent.
- Never exceed the sending limits of ADR-013 (warm-up, daily cap, bounce stop); outreach runs from the main domain.
- Never store personal e-mail addresses that were not published by the business itself or given to us by the person.
- Never generate a mockup automatically; mockups run only when the owner starts them for a chosen lead (ADR-005).
- Never post to social networks for clients. Postaja is fed only for the Inženirji.si brand (ADR-006).
- Never use floats for money: integer euro cents; AI cost in integer micro-euros (as in inzenirji-widget ADR-005).

## Stack (fixed — new dependencies need a justification in the PR and an ADR if non-trivial)
Next.js (App Router) + TypeScript strict + Tailwind CSS, Inženirji.si design (ADR-002) · PostgreSQL 16 + Drizzle ·
pg-boss jobs · Better Auth magic link · Kamal 2 on the shared Hetzner VM (ADR-011).

## Shared server — hard rules (ADR-011)
The VM `91.99.191.8` also runs asisto, Postaja dev + prod and later volil.si. Only ever add or change **our own**
things: the `inzenirji-crm` Kamal service, the `db` accessory (container `inzenirji-crm-db`), the `inzenirji-crm-db-data` and `inzenirji-crm-uploads` volumes and
`ops/nginx/crm.inzenirji.si.conf`. Never edit other nginx server blocks, the kamal-proxy boot config, other
containers/volumes, the firewall or system packages. Every resource we run has a memory limit.

## UI rules (Inženirji.si CGP)
Black background `#000000`, surfaces `#0A0A0A` / `#111111`, borders 1px `#222222`, text `#EAEAEA` / `#888888`,
accent `#00FF41`, danger `#1A0505` / `#FF3B3B`. Headings and data in JetBrains Mono, body in Inter.
`border-radius: 0` everywhere, no soft shadows, instant hover (invert), no bounce animations.
Use the same Tailwind tokens as `inzenirji.si/tailwind.config.ts`. UI language: Slovenian.

## Quality bar
`lint`, `typecheck`, `test`, `build` green locally and in CI.
