# TASK-014 — feedback

Owner 2026-10-16: "Ne vem kaj se zgodi ko kliknem predplačilo prejeto, kje to vidim?"

## What I implemented
Migration 0015 (`projects`, `project_pauses`, `project_files`, `project_status`, `drafts.purpose/ref_id`),
`src/server/projects/` (start from accepted proposal, guarantee clock, client submit/delete, owner tick, upload-link and
reminder e-mails, confirmation e-mail, `onDraftSent` hook in `sendApprovedDraft`, pause/resume/launch/final payment;
storage on `UPLOAD_DIR`), owner pages `/projekti` and `/projekti/[id]`, authenticated download route, public
`/projekt/[token]` with per-item text/file upload, "Danes" block, sidebar, Dockerfile `/data/uploads`, Kamal volume,
server action body limit 45 MB.

## Test results
Unit 96/96 (+ clock: not started, pauses, open pause, pauses before start, launch freezes; upload type/size checks).
Integration 64/64 (+ full flow: won + project with deposit 359,90 €, idempotent, upload link e-mail, bad type refused,
file stored on disk, text item, invalid index, delete makes item missing, confirmation e-mail → sent via
`sendApprovedDraft` → clock starts, no uploads after confirmation, pause rules, deadline extended by pause).
Visual + real upload: client page run locally, a file uploaded and a text submitted through the browser (mobile).

## Deliberate breaks
Send hook removed → project stays in "materials" after the confirmation e-mail, test fails → restored.

## NOT RUN
Upload on prod through host nginx (client_max_body_size 50M is in `ops/nginx/crm.inzenirji.si.conf`; if the owner's
installed block lacks it, large uploads fail with 413 — check on first real project).
