# TASK-039 feedback — site kickoff

Branch `feat/TASK-039-site-kickoff`. Template (TASK-040) is built and pushed first: `davidtacer/inzenirji-site-template`.

## Proof (this session)
```
inzenirji-crm@0.1.0 lint /home/claude/inzenirji-crm
eslint

tsc --noEmit

 Test Files  31 passed (31)
      Tests  141 passed (141)
     × initialize, tools/list, notifications 61ms
     × apply from zero and create the core tables 285ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/server/db/migrate.int.test.ts > migrations > apply from zero and create the core tables
 FAIL  src/server/mcp/mcp.int.test.ts > MCP for the nightly researcher (TASK-036) > initialize, tools/list, notifications
 Test Files  2 failed | 25 passed (27)
      Tests  2 failed | 139 passed (141)
 Test Files  27 passed (27)
      Tests  141 passed (141)
```
- Kickoff against a mocked GitHub API (in-memory fake, `fakeGithub.testutil.ts`): repo created private from template, every file on `dev`, `main` untouched; a forced 500 on the BRIEF commit leaves stage `setup`, the retry creates no second repo and a third run makes zero commits; existing repo is reused; 0 and 3 uploads (name collisions, hostile name); guide URL absent from every repo file.
- Exclusions: seeded score 87, deal value 99999 cents and a private note never appear in BRIEF.md or in MCP `get_project`.
- Stages: agent cannot set `design_approved` or `building` (MCP returns isError), owner approves, then agent may build.
- UI proof (local build against the test DB, session cookie signed locally): `/strani/nova` created a site for an existing company; the detail page shows steps, forms and the manual checklist on desktop (1280) and phone (390); "Začni pripravo" without credentials shows the Slovenian "Najprej nastavi GitHub App" message. Screenshots were reviewed in the session, not committed.

## NOT RUN
- A real GitHub run (no App credentials in the sandbox). GitHub may refuse repo creation from a GitHub App installed on a personal account; the Nastavitve card documents the fine-grained token fallback (deviation: not in the spec).
- Cloudflare, editor-config repo (`inzenirji-editor-config` does not exist yet; its step is non-blocking).

## Deviations from the spec
- Separate table `site_projects` (not an extension of `projects`, which requires a deal and a deposit); `project_id` links them.
- BRIEF is `BRIEF.md` at the repo root (template placeholder), not `docs/BRIEF.md`.
- Migration capture of old-site text/images is left to the agent; CLAUDE.md gets a client section without glossary/prohibited items (they go into brief notes).
- Fallback fine-grained token in settings.
- Stage `setup` before the first successful kickoff.

## Review round 1
(empty)
