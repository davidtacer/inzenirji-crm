# TASK-040 — Site template repo
Depends on: editor guide v1.2 (repo `davidtacer/inzenirji.si`, `docs/urejevalnik-navodila.md`)
Read first: the guide in full; `inzenirji-widget` docs (editor API and `content/` contract, once defined).

Status: **Planned** (spec only). Lives in its own repo (proposed name `inzenirji-site-template`, GitHub template repository), not in
this CRM repo; this file only records the dependency of TASK-039.

## Goal
A template repository from which every client site starts, so that a new site is a day of work and the editor works on it without code changes.

## Scope
- Next.js static export (`output: 'export'`), TypeScript strict, zod schemas, `content/` (site.json, pages, i18n), `public/uploads/`,
  `_redirects`, `_headers`, block catalogue (guide §5), `npm run validate`, `npm run export-schema`, build that fails on invalid
  content (guide §1, §6), relative links and image paths (guide §19.5), environment-aware robots/headers by `CF_PAGES_BRANCH` (§19.4).
- Cookie notice and GA4 per guide §22 (consent first, production only, events through `data-track`), pages `piskotki` and `zasebnost` as templates.
- `editor.config.json` placeholder, `CLAUDE.md` template with placeholders the CRM fills (client, tone, glossary, prohibited items).
- `guideVersion` set to the guide version the template follows; a CHANGELOG with migration notes matching guide §23.4.

## Acceptance criteria
- A site built from the template passes the guide's checklist (§16) with sample content; Lighthouse mobile ≥ 90.
- The eight editor test changes (guide §14.10) work on the sample site once the editor exists.
