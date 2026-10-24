# TASK-041 — Sites register ("Strani")
Depends on: TASK-039 (site projects), ADR-057
Read first: docs/00-MANIFEST.md, docs/03-DECISIONS.md (ADR-033, ADR-056, ADR-057), editor guide v1.2 (repo `davidtacer/inzenirji.si`, `docs/urejevalnik-navodila.md`, §17–§19, §23), TASK-039 spec, code paths of projects and the scheduler.

Status: **Planned** (spec only). Decision: ADR-057.

## Goal
The owner opens "Strani" in crm.inzenirji.si and sees every site that runs on our system and editor, what state each is in, which
ones are outdated against the current guide, and which ones need attention. He can also add a site that was built before the
kickoff existed.

## Scope
### 1. Page "Strani" (sidebar)
- Table of all site projects (`client`, `migration`, `own`): site name + company, kind, stage, live URL, editor (off / on),
  number of editors, last edit (when editor stats exist, else "ni podatka"), guide version (red when behind), health (ok / fail /
  unknown with the time of the last check), guarantee days left (only when the clock is on).
- Filters: kind, stage, guide behind, editor off, no edit in 30 days, health failed; search by name or domain; counts per filter.
- Row opens the project page of TASK-039 (repo, dev preview, manual-steps checklist, editors, stage notes).

### 2. "Registriraj obstoječo stran"
- Form: site name, company (existing or created by hand like TASK-026), kind, `site_id`, repo (`owner/name`), live URL, dev URL,
  `guideVersion` (or "neznana"), editor on/off, editors (emails + role), optional notes.
- Creates a site project at stage `handed_over` (or the chosen stage) **without** running the kickoff and without touching the repo.
- Optional "Preberi iz repozitorija": reads `editor.config.json` through the GitHub App and prefills `site_id`, URLs and `guideVersion`.

### 3. Daily health check (scheduler, plain HTTP, no AI)
For each site with a live URL, once a day (Europe/Ljubljana night), with 10 s timeouts and a descriptive User-Agent:
- live URL answers 200 (follow up to 3 redirects);
- when the editor is on: `<live>/uredi` redirects (302) to the editor URL with `?site=<site_id>`;
- `<live>/robots.txt` and `<live>/sitemap.xml` answer 200;
- dev URL (when set) is not publicly readable or answers with `X-Robots-Tag: noindex`;
- the result of each check is stored (`ok` / `fail` / `unknown`, time, short reason); a failed check shows on Danes until it passes again.
- Not checked here (needs a browser): cookie notice, GA4 behaviour. They stay manual items on the project page.

### 4. Guide version
- Nastavitve holds the current guide version. A site whose `guideVersion` is lower is marked "zaostaja" and listed under a
  filter; opening it shows the migration notes the guide lists for the versions in between (copied by hand into the setting or a
  link to the guide section).

## Decisions already made (do not re-decide)
- Plain HTTP checks, no AI, no browser (ADR-057). Failed checks go to Danes; no e-mail alerts in v1.
- Editor activity columns show "ni podatka" until `inzenirji-widget` exposes editor stats; they are not guessed.
- The page is for the owner only (no client access).

## Tests
- Unit: guide version comparison (`1.2` vs `1.10`), health result mapping, `site_id` validation on manual register.
- Integration: register an existing site by hand (no repo changes), daily check against a local test server (200, 302 to editor,
  404, timeout, redirect loop), filters and counts, failed check shows on Danes and clears after a pass.
- E2E (local): "Strani" page with seeded sites in each state (desktop, phone screenshots).
- Exact boundaries: 0 sites; a site without live URL; redirect chain of 3 vs 4; timeout at 10 s.

## Must not touch
Outreach, drafts, proposals, weekly report; the kickoff job itself (TASK-039).

## Allowed dependencies
None new (`fetch`). Anything else: ask first.

## Acceptance criteria
- "Strani" lists seeded and manually registered sites with correct stage, editor state, guide state and health.
- A site with an outdated guide version appears under the "zaostaja" filter.
- A deliberately broken live URL shows `fail` after the next check and appears on Danes.
- All checks pass (lint, typecheck, unit, integration); proof pasted; feedback written; docs updated.
