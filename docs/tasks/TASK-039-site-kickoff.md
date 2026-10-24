# TASK-039 — Site kickoff (repo, brief, rules, prompt)
Depends on: TASK-014 (projects), TASK-026 (manual company entry), TASK-036 (MCP endpoint), TASK-040 (site template repo)
Read first: docs/00-MANIFEST.md, docs/03-DECISIONS.md (ADR-024, ADR-033, ADR-038, ADR-056), docs/01-PRODUCT-SPEC.md §5.9, editor guide v1.2 (repo `davidtacer/inzenirji.si`, `docs/urejevalnik-navodila.md`, sections 14, 17–19, 21–23), TASK-014 and TASK-026 feedback, code paths of projects, company entry and MCP.

Status: **Planned** (spec only). Decision: ADR-056 (Accepted). Register of sites: TASK-041.

## Goal
The owner opens a company or project in crm.inzenirji.si, clicks "Začni izdelavo strani", and gets: a private repo with the
site template, all facts about the client in the repo, the building rules, the editor connection and a ready kickoff
prompt for the Claude agent. He does not repeat this setup per client. The same action works for a site he adds by hand
(company not in the CRM, a site being migrated, one of his own sites).

## Scope
### 1. Site project and entry points
- `site_projects` (or extend `projects`): `kind` (`client` | `migration` | `own`), `site_id` (unique, `a-z0-9-`, never changed
  after creation), `stage`, `brief_version`, `repo_full_name`, `guide_version`, links (repo, dev preview, live, Cloudflare
  projects), `domain`, `registrar_note`, `editors` (email + role `owner|editor`, confirmation note).
- Entry A: button on a `client` project once "Predplačilo prejeto" is set (ADR-033). Entry B: "Začni brez predplačila" with a
  required reason (logged as activity).
- Entry C: **"Nova stran" by hand** on the Projekti page: form with company name (autocomplete over existing companies; if none,
  a new company is created with the existing manual-entry logic, ADR-024), `kind`, domain/current URL, contact, price (not for
  `own`), languages, special features, deadline, existing CGP yes/no, notes. No proposal, no deposit, no guarantee clock for
  `own`/`migration` unless the owner turns the clock on.
- `site_id` proposed from the domain (`vodniskuter.si` → `vodniskuter-si`), editable until the repo is created.

### 2. Kickoff package (background job, idempotent, resumable)
1. Create private repo `<owner>/<site_id>` from the template repo (TASK-040) via the GitHub API.
2. Write `editor.config.json` (`siteId`, `siteName`, `repo`, branches, urls, `editorUrl`, `guideVersion`, `enabled:false`).
3. Write `docs/BRIEF.md` (snapshot; header with generated-at and brief version): company, what they do, audience, tone, what is
   wrong with the old site, competitors (from TASK-022/023), Google profile facts, hours mismatches, agreed offer (price, languages,
   features, deadline), contacts, call notes marked for the client project, materials received and missing, domain/DNS facts,
   editors, GA4 status. **Excluded:** score, price strategy, owner-private notes, e-mail drafts, anything from do-not-contact logic.
4. Fill `CLAUDE.md` from the template: client, tone, glossary, prohibited items.
5. Copy client material (uploads from `/projekt/<token>`, captured old-site text and images for `migration`) into `brief/assets/`
   with a `brief/assets/INDEX.md` (file, source, rights note).
6. Create `sites/<site_id>/site.json` and `editors.json` in the private `inzenirji-editor-config` repo.
7. Generate the **kickoff prompt** (stored on the project, "Kopiraj" button): points to `BRIEF.md`, the guide URL from
   Nastavitve `siteGuideUrl`, the stages and gates below, and says to write status back through MCP. The guide URL is never
   committed to the client repo.
- Each step records its result; a failed step shows the reason and can be retried without duplicating anything (repo exists → reuse).

### 3. MCP additions (ADR-038 endpoint)
- `get_project(site_id)` → brief fields and materials, same exclusions as `BRIEF.md`.
- `save_project_status(site_id, stage, note, links?)` → stage change, note and links (design draft, preview URL).
- Same key and logging as the existing tools; results are verified server-side (stage must be a valid next stage).

### 4. Stages and owner gates
`brief_ready → cgp → research → design_draft → design_approved → building → preview_ready → handed_over`.
The agent may move forward to `design_draft`; **`design_approved` is set only by the owner** in the CRM (button with a note).
Building starts only after it. The project page shows stage, links, open materials and the guarantee clock if on.

### 5. Project page: manual steps for the owner
Checklist with exact steps copied from the guide: create the two Cloudflare Pages projects (guide §19.2), DNS (§19.3), build
notification (§20), editor emails (§18.3), GA4 property (§22.3). Each item can be ticked; nothing here is automated in v1.

### 6. Settings
Nastavitve card "Izdelava strani": GitHub App id, installation id and private key (secret), repo owner, template repo name, `siteGuideUrl`, current
`guideVersion`. Card shows exact owner steps (where to create the GitHub App or token, which permissions, where to paste).

## Decisions already made (do not re-decide)
- Source of truth is the CRM; `BRIEF.md` is a snapshot (ADR-056).
- Repos are private, in the owner's account, transferred only if a client asks.
- No Cloudflare automation in v1. No guide URL in client repos. Owner-only approval of the design.
- Manual entry reuses the existing company entry; no second company form.

## Owner answers (2026-10-24)
- Repos are created in the owner's private account; transfer to a client only if he asks later.
- Credential: GitHub App (installed on the owner's account; Nastavitve card gives every step).
- The site template (TASK-040) is built first; TASK-039 is tested end to end only after it exists.

## Tests
- Unit: `site_id` derivation and validation; BRIEF exclusions (a seeded owner-private field never appears); stage transitions
  (invalid jump rejected; `design_approved` not settable through MCP).
- Integration: kickoff job against a mocked GitHub API (repo created, files committed, retry after a failure creates no duplicates);
  manual entry creates company + project without deposit and logs the reason; MCP `get_project` / `save_project_status`.
- E2E (local): "Nova stran" for a company not in the CRM → project → kickoff package preview.
- Exact boundaries: `site_id` uniqueness; 0 assets; 200 assets; a client with no domain yet.

## Must not touch
Outreach sending, drafts approval, weekly report, existing proposal and deposit logic (ADR-031/032/033), the public demo.

## Allowed dependencies
`@octokit/rest` (or `fetch` against the REST API). Anything else: ask first.

## Acceptance criteria
- From a won project and from "Nova stran" the kickoff package is created in a test GitHub account and the repo contains
  `editor.config.json`, `docs/BRIEF.md`, `CLAUDE.md`, `brief/assets/`.
- The kickoff prompt opens a fresh Claude session that reaches `design_draft` without asking the owner for client facts.
- All checks pass: lint, typecheck, unit, integration tests (commands per CHEATSHEET).
- Proof pasted: job log of one full run, screenshots of the project page (desktop, phone), the generated `BRIEF.md`.
- Feedback written, every deviation listed; docs updated (technical, CHEATSHEET owner steps, HANDOFF).
