# TASK-020 — Owner-only login

## Goal
Only the owner can open the CRM: magic-link login, logout, every page protected (ADR-015).

## Scope
Better Auth tables + migration `0001_auth`, `createAuth()` with owner allowlist (hook + mail filter), login page and
form (Slovenian, brand look), logout, `requireOwner()` on pages, branded login e-mail from `hello@inzenirji.si`,
deploy config (SMTP env + `SMTP_PASSWORD`), CI container checks `/login` 200 and `/` 307.

## Acceptance criteria
Integration tests: owner gets a mail and a session; strangers get the same answer, no mail, no user; links are
single-use; the DB hook refuses non-owners; no schema drift. CI green.
