# TASK-028 — feedback

Owner 2026-10-16: "ne bomo preko env to nastavljali, v CRM naj bodo admin nastavitve".

## What I implemented
Table `settings` (migration 0008), `src/server/settings.ts` (defaults, validation, get/save), all reads switched
(`outreachConfig`, `lockReason`, `aiConfig`, `contactOptions`, Places cap in search/research), `/nastavitve` page with
secret status, sidebar link, link from Osnutki, env switches removed from deploy config, manifest rule.

## Test results
Unit 83/83 (+ defaults, validation ranges/link/phone, switch + password decide sending, AI off at budget 0).
Integration 50/50 (+ saved values win and can change; table list updated).

## Deliberate breaks
Saved rows ignored in `getSettings` → `expected { sendingEnabled: true … } to deeply equal { sendingEnabled: false … }` → restored.
