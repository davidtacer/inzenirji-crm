# Handoff — state as of 2026-10-15 13:50 (Europe/Ljubljana)

## Working mode
Mode B (autonomous), standing permission 2026-10-15 — owner's words: "Način dela: B (avtonomno kot pri
urejevalniku)" (ADR-012). Agent commits on `feat/*`, `fix/*`, `docs/*`, opens PRs to `dev`, merges only on green CI.
Ask the owner only for: secrets, accounts, server and DNS steps, product decisions, prod, irreversible steps.
**Owner's standing rule (2026-10-15):** every time the owner has to do something himself (server, DNS, GitHub
settings, secrets, accounts), write out **every step**: exact commands to copy, where to click, what he should see,
and what to do if it fails — even if it was explained before. He does not do these things often.
**Production:** since 2026-10-15 the agent also promotes `dev` → `main` and verifies the deploy (ADR-016).
**Merging:** the owner gave permission to merge own PRs on green CI (2026-10-15: "maš dovoljenje od moje strani,
da lahko mergaš sam"). If the session's permission layer still denies a merge, tell him and he merges.
Conversation with the owner in Slovenian; code and docs in English.

## Git and CI specifics
- Branches: `main` (initial docs commit), `dev` created from it as the working branch. Flow per DEVELOPMENT-RULES.
- `gh` GraphQL is blocked in cloud sessions: use REST (`gh api repos/davidtacer/inzenirji-crm/...`).
- No CI yet (TASK-001).

## Done
- 2026-10-24: Cloudflare runbook (`docs/technical/cloudflare.md`) and new per-site checklist: preview always on `dev.<domain>` (Chrome flags `*.pages.dev`/`*.workers.dev` lookalikes). Kickoff writes `urls.dev = https://dev.<domain>`. Registered sites: no stage panel or checklist, editable repo/hosting/editor state/legacy. vodniskuter.si: editor.config.json + /uredi on its `dev`, dev Worker `vodniskuter-si-dev` on dev.vodniskuter.si, registered in `inzenirji-editor-config` (editor dtacer@gmail.com owner), `enabled: false`.
- 2026-10-24: TASK-041 part 1 Built (PR open): "Registriraj obstoječo stran" (migration 0025). Fix: pasted GitHub App private key is normalised (PR #135, merged to dev); "Preveri povezavo" works. Owner: after merge to main, register vodniskuter.si, grant-si, inzenirji.si (Strani → Registriraj obstoječo); tick "stara arhitektura" for sites without editor.config.json. Next: health checks, filters, guide-behind flag (rest of TASK-041).
- 2026-10-24: TASK-040 site template Done (repo `davidtacer/inzenirji-site-template`, v1.2.0, main + dev). TASK-039 site kickoff Built (PR open): `/strani`, "Nova stran", kickoff job, MCP `get_project`/`save_project_status`, Nastavitve → Izdelava strani. Owner: create the GitHub App (steps in the card), set the guide URL, run the first kickoff on a test site; if GitHub refuses repo creation for a personal account use the fallback token. Next: TASK-041 register.
- 2026-10-15: repo created by the owner; docs foundation (manifest, product spec, architecture, ADR-001…010,
  task list) from the business plan `inzenirji.si/docs/nacrt-rasti.md`.

- 2026-10-24: bounce stop holds only first e-mails to new addresses; follow-ups go out (ADR-053 update).
- 2026-10-21: ADR-055 "Piši tudi na ta naslov" (draft kind extra); follow-ups never to a wrong address.
- 2026-10-21: ADR-054 OZS member catalogue as second directory (after bizi.si).
- 2026-10-21: ADR-053 directory pages never a website, only the company's own entry on listing pages, clean-up; bounce stop needs 3 bounces.
- 2026-10-21: ADR-051 "Uredi podatke" on the company page (name, phone, address, city, website, category).
- 2026-10-21: ADR-051 website form guard (domain, rules, AI, held list on Odgovori; time check on the landing). ADR-052 bounces matched by recipient and marked invalid, domain check before send, Danes only e-mailable leads.
- 2026-10-21: proposals: items at 0 € allowed and shown as "vključeno"; only a proposal with total 0 is refused.
- 2026-10-20: ADR-050 attachments on e-mails (Osnutki, up to 5 files / 15 MB).
- 2026-10-20: Osnutki shows today's sends split into first e-mails and follow-ups; the cap still counts all cold e-mails (ADR-013).
- 2026-10-20: ADR-049 structured outputs (json_schema) for all JSON AI answers, fallback without it.
- 2026-10-20: ADR-048 AI-written follow-ups per company, short business name, lenient AI answer parsing.
- 2026-10-19: ADR-047 smart search (activity/town lists, synonyms, skip 90 days, adaptive paging, history), https check before no_https, coming-soon phrases, draft author shown.
- 2026-10-19: ADR-046 AI-phrase ban (humanizer) and the weekly bottleneck (theory of constraints).
- 2026-10-19: ADR-045 first e-mail fully written by AI within checks; no competitor line; owner's editor sentence.
- 2026-10-19: ADR-044 wrong e-mails (invalid mark, aggregator/foreign-domain rule, start-up sweep), Za klic list, recipient drop-down in drafts.
- 2026-10-17: Automatic follow-ups (ADR-043, owner switch in Nastavitve, off by default) and the "Ne kontaktiraj" page (list, search, add e-mail/domain by hand; permanent).
- 2026-10-17: "Testno podjetje" switch on the company page (`companies.is_test`): the owner's test sale/demo/form trials stay in the CRM but are left out of reports.
- 2026-10-17: TASK-015 Meta Ads + Search Console in the weekly report (ADR-042). Owner: Nastavitve → Meta oglasi (token + act_ id); Nastavitve → Google → "Poveži znova" for Search Console (enable the Search Console API in Google Cloud first).
- 2026-10-16: TASK-016 weekly report (ADR-040): `/porocila` + Monday 08:00 e-mail (`WEEKLY_REPORT=1` in deploy.yml). Owner: no invoices in the CRM, e-racuni.si (ADR-041).
- 2026-10-16: First e-mail and day-3 follow-up now lead with the AI editor (edit by chatting, send a picture) and link the public demo `inzenirji.si/demo` (owner: "naš paradni konj").
- 2026-10-16: TASK-037 Google pregled with Gemini (ADR-039). Owner: aistudio.google.com/apikey → Create API key → Nastavitve → Google pregled (Gemini) → Shrani; then company page → "Google pregled".
- 2026-10-16: TASK-036 nightly Claude researcher over MCP (ADR-038) built. Owner: Nastavitve → Nočna raziskava → create URL →
  claude.ai Settings → Connectors → Add custom connector; then the agent creates the scheduled task.
- 2026-10-16: TASK-035 research as background jobs (ADR-037) Live.
- 2026-10-16: TASK-034 AI researcher (ADR-036) Live, owner-tested (Fantazija). Web search must be sent WITHOUT
  user_location (API: "Country code SI is not supported").
- 2026-10-16: TASK-033 website inquiries (ADR-035) Live: inzenirji.si form → `/api/leads/website` → company, Pogovor,
  reply draft, owner e-mail. Owner: put the same key into Vercel env `CRM_LEADS_TOKEN` (Nastavitve card has steps).
- 2026-10-16: TASK-032 editor demo leads (ADR-034) built: `POST /api/leads/demo`, key at Nastavitve → Demo
  urejevalnika, Danes funnel, company card. Owner: create the key and paste it into the editor Worker secret
  `CRM_LEADS_TOKEN` (editor repo `docs/runbooks/demo.md`).
- 2026-10-16: TASK-014 projects (ADR-033) Live (PR #61); new Kamal volume `inzenirji-crm-uploads`.
- 2026-10-16: TASK-013 part 1 proposals (ADR-031/032) Live, owner-tested end-to-end incl. UPN QR.
- 2026-10-16: TASK-031 web search (ADR-030) Live. TASK-030 filters Live. Google Calendar connected by the owner.
- 2026-10-16: TASK-012 part 2 Google Calendar (ADR-029) Live; owner must create the OAuth client (CHEATSHEET).
- 2026-10-16: TASK-029 full correspondence (ADR-028) Live.
- 2026-10-16: TASK-012 part 1 calls (ADR-027) Live.
- 2026-10-16: TASK-028 settings page (ADR-026) Live, owner-tested.
- 2026-10-16: TASK-027 contextual reply drafts (ADR-025) Live.
- 2026-10-16: TASK-026 manual company entry (ADR-024) Live; owner tested end-to-end: sent to himself, landed in Gmail Inbox, reply classified "interested", reply draft created.
- 2026-10-15: TASK-009 mailbox sync + reply classification + reply drafts (ADR-023) Live. Owner set `OUTREACH_ENABLED=1` (only unlocks the Send button; DKIM status not confirmed). Owner set `OUTREACH_SMTP_PASSWORD`; sending still locked (`OUTREACH_ENABLED` unset) until DKIM.
- 2026-10-15: TASK-025 bizi.si e-mails by address (ADR-022) Live; real markup unverified.
- 2026-10-15: TASK-024 AI remark (ADR-021) Live; owner set `ANTHROPIC_API_KEY`.
- 2026-10-15: TASK-023 deep research (ADR-020) Live.
- 2026-10-15: TASK-008 drafts + approval queue + guarded sending (ADR-019) Live. **Sending locked** until DKIM + owner sets `OUTREACH_SMTP_PASSWORD` and variable `OUTREACH_ENABLED=1`.
- 2026-10-15: TASK-007 lead scoring 0–100 + "Danes" top 10 (ADR-018) Live on prod.
- 2026-10-15: TASK-022 nearby competitors (ADR-017) + A/B legend built (PR open). Cap 100.
- 2026-10-15: TASK-006 research v1 Live. Favicons: CRM `>I` live; editor `I_` on widget dev (PR #21 there).
- 2026-10-15: TASK-021 sidebar layout (owner request with TeleCRM reference) built (PR open).
- 2026-10-15 16:54: TASK-005 Live on prod, owner-tested (search "frizerski salon Celje" filled the table). Built earlier: owner set `GOOGLE_PLACES_API_KEY` (restricted to the server IP) 16:34.
- 2026-10-15 16:27: **TASK-020 login Live on prod, owner-tested** — owner set `SMTP_PASSWORD`, promoted, requested a link, received it from hello@inzenirji.si and is signed in.
- 2026-10-15 16:07: owner ran `setup` (DB booted) and promoted TASK-003; prod health `{"status":"ok","sha":"e650f24…","db":"ok"}`. **Live.**
- 2026-10-15: TASK-003 data model merged (PR #7, CI green incl. container + migrations): 8 tables, startup migrations, DB health, do-not-contact.
- 2026-10-15: TASK-002 deploy skeleton merged (PR #4). First deploy = owner step below.
- 2026-10-15: TASK-001 scaffold merged (PR #3, CI green).
- 2026-10-15: owner merged PR #1 (docs ADR-011..013).
- 2026-10-15: owner decisions → ADR-011 shared Hetzner VM (Kamal, host nginx edge, own Postgres accessory),
  ADR-012 mode B, ADR-013 outreach from `david@inzenirji.si`. Server facts taken from `DataVallis/postaja` docs
  (CHEATSHEET, ADR-025/027/084, `config/deploy.dev.yml`, `ops/nginx/`).

## Shared server — read before any deploy work
VM `91.99.191.8`, user `deploy`, also runs asisto (host PHP-FPM behind nginx), Postaja dev + prod (Kamal) and later
volil.si. Only add our own Kamal service, accessory, volume and nginx server block (manifest "Shared server").
The agent sandbox cannot SSH there (egress proxy); every host step is an owner action from a runbook.

## Owner's open actions
Done by the owner 2026-10-15 ("sem uredil vse"): DNS `crm.inzenirji.si`, nginx server block + certbot on the host,
mailbox `david@inzenirji.si`, GitHub environment `prod` (secrets + variables per CHEATSHEET) and the deploy key.
Seen from the agent (DNS over HTTPS): SPF `v=spf1 +a +mx ~all`, DMARC `p=none`. Not verifiable from the sandbox:
DKIM and MX → owner ran mail-tester.com on 2026-10-15: **9/10**. SPF pass (sending server `gateone.datavallis.com`,
78.46.239.231), DMARC pass, not blocklisted, **DKIM missing** (−1). TASK-008 (first outreach send) is **blocked until
DKIM signs mail from `david@inzenirji.si`** (ADR-013); re-test must show "Your message is signed with DKIM".

## Production state
- 2026-10-15 15:52: owner promoted `dev` → `main` (PR #6); automatic "Deploy prod" run 38746379019 green; smoke check
  served `ce9b738` (TASK-002 app, no database yet). `https://crm.inzenirji.si/api/health` →
  `{"status":"ok","sha":"ce9b738…"}`. **Live on prod** (app only).
- 2026-10-15 16:07: database booted by the owner's `setup` run; TASK-003 live, health `db: ok` (sha e650f24).
- (History) The database accessory was not booted by the first automatic run (it skips `setup`). From TASK-003 on the app needs it
  (migrations at start, `db` in health), so the owner runs `setup` **before** promoting TASK-003:
  1. Actions → "Deploy prod" → Run workflow → branch `main` → tick **setup** → Run (boots `inzenirji-crm-db`,
     redeploys the same version).
  2. Then promote `dev` → `main` as before; the automatic run applies migrations and the smoke check needs `db: ok`.

## Local Postgres for integration tests
`TEST_DATABASE_URL` must point to a real Postgres 16; tests drop and recreate the `public` schema, so use a
throwaway database. In the cloud sandbox: `initdb` as user postgres in `/var/tmp/crm-pg`, port 55432, then
`TEST_DATABASE_URL=postgres://crm@127.0.0.1:55432/crm_test pnpm test:int`.

## Next
TASK-001 scaffold (Next.js + Tailwind + Drizzle + Postgres in Docker locally, CI), TASK-002 Kamal deploy skeleton, then the C1 phase (prospecting, research, scoring) — target 2026-11-07.

Latest TASK: 041 (039–041 specified, not started; build order 040 → 039 → 041) · latest ADR: 057 (ADR-051 number is used twice). Next candidates: Meta lead forms (rest of TASK-011, not a priority), after launch (TASK-018), win/loss (TASK-019), rest of TASK-011 inbound leads. Local Postgres for int tests may stop when the sandbox restarts — restart with `pg_ctl` (see above).
