# TASK-021 — feedback

## What I implemented
Sidebar app shell (desktop + phone), page header component, pages moved into the `(app)` route group, website kind
classification with tests, table cell and counter updated.

## New dependencies
lucide-react@1.52.0 — icons for the sidebar (same version as Postaja).

## Test results
Unit `Tests 21 passed (21)` (+2 for `websiteKind`), integration `Tests 19 passed (19)`, lint/typecheck/build OK.
Screenshots checked locally at 1600×900 and 390×844 (signed in via a real magic link against a local DB with sample
companies): sidebar, active item, full-width table, social/link labels with links, phone menu.

## Deliberate breaks
`websiteKind` look-alike test (`notfacebook.com` must be "own") is the guard against suffix matching mistakes;
changing `endsWith(".${d}")` to `endsWith(d)` makes it fail (checked) → restored.

## NOT RUN
Docker locally (no daemon) — CI runs the container.
