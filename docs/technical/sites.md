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

## Not done in v1
Captured old-site text and images for `migration` sites (the agent fetches them from the old site), Cloudflare automation, glossary and prohibited-items fields in the CLAUDE.md section (they go in the brief notes).
