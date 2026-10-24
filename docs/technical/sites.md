# Sites: kickoff of client websites (TASK-039)

Status: **Built** (unit and integration tests with a mocked GitHub; first real run against GitHub is the owner's step, see CHEATSHEET). Decisions: ADR-056, ADR-057.

## What it does
`/strani/nova` (or "Začni izdelavo strani" on a project with a deposit) creates a `site_projects` row; "Začni pripravo" runs the kickoff job.
The job works on the private repo `<owner>/<siteId>`, created from the template repo (TASK-040), always on branch `dev`:

| Step | Result |
|---|---|
| `repo` | repo from template (all branches), reused if it exists |
| `editor_config` | `editor.config.json` (siteId, urls, guideVersion, `enabled` kept as is, default false) |
| `brief` | `BRIEF.md` snapshot, `briefVersion` +1 |
| `claude_md` | client section between `<!-- CLIENT:START … -->` markers in `CLAUDE.md` |
| `assets` | uploads of the linked project into `brief/assets/` + `INDEX.md` |
| `prompt` | kickoff prompt stored on the site row (needs `siteGuideUrl`) |
| `editor_registry` | `sites/<id>/site.json` + `editors.json` in the private `inzenirji-editor-config` repo (does not block `brief_ready`) |

Every step stores its result in `site_projects.steps`; a retry skips finished steps and a file with unchanged content makes no commit.
All steps ok (except `editor_registry`) → stage `setup` → `brief_ready`.

## Code map
- `src/server/sites/store.ts` create/read/update, stage moves, `loadBriefInput` (the only reader for BRIEF and MCP).
- `brief.ts` `BriefInput` type (allowlist), `buildBrief`, `fillClaudeMd`, `buildKickoffPrompt`.
- `kickoff.ts` steps and job; `github.ts` REST client (App JWT → installation token, or fallback fine-grained token); `config.ts` settings row `sitesConfig` (private key and token encrypted).
- `stages.ts` stage rules; `checklist.ts` manual owner steps; `siteId.ts`.
- MCP tools `get_project`, `save_project_status` in `src/server/mcp/mcp.ts`.
- UI: `src/app/(app)/strani/*`, card in `nastavitve/sites.tsx`.

## Rules worth knowing
- Owner-private data never leaves the CRM: `BriefInput` has no field for score, deal value, owner notes, drafts or do-not-contact data.
- The agent can move to `cgp`, `research`, `design_draft`, `building`, `preview_ready`; `design_approved` only by the owner in the CRM; `building` only from `design_approved`.
- The guide URL is stored in settings and in the kickoff prompt only, never committed to a client repo.
- `client` without a paid deposit needs a start reason (activity note on the deal).
- Brief header is `BRIEF.md` at the repo root (the template has the placeholder there), not `docs/BRIEF.md` as the spec first said.

## Registering an existing site (TASK-041, part 1)
`/strani/registriraj` (`registerSiteProject` in `store.ts`) records a site that already exists on our infrastructure: company (existing or new), kind, domain, live URL, optional `owner/repo`, hosting, editor state (`none|planned|active`), editors, `legacy` flag (repo has no `editor.config.json` = migration candidate). It sets `registered = true`, stage `handed_over`, link `live`.
- It is a record only. No repository is created and nothing is written to it. `startKickoff` refuses a registered site and `runKickoff` throws `SITE_REGISTERED_READONLY`; the detail page shows an info box instead of the kickoff panel.
- Migration `0025_site_registered.sql` adds `registered`, `legacy`, `hosting`, `editor_state`.
- The detail page of a registered site hides the stage panel and the manual checklist and shows an edit form for repo, hosting, editor state and the legacy flag (`updateRegistered`, CRM row only).
- "Legacy" means old architecture (no JSON content in `content/`). A site built the new way that only lacks `editor.config.json` is not legacy.
- Open (rest of TASK-041): daily plain-HTTP health checks, filters, "behind the guide" flag, Danes alerts, optional read-only repo read.

## Dev preview URL
Always `https://dev.<domain>` (`devUrl` in `siteId.ts`); `*.pages.dev` / `*.workers.dev` names that contain the client domain are flagged by Chrome as fakes. Runbook: `docs/technical/cloudflare.md`.

## Not done in v1
Captured old-site text and images for `migration` sites (the agent fetches them from the old site), Cloudflare automation, glossary and prohibited-items fields in the CLAUDE.md section (they go in the brief notes).
