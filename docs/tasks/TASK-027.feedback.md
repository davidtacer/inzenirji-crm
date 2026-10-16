# TASK-027 — feedback

Owner 2026-10-16 (after a successful end-to-end test to himself, mail landed in Gmail Inbox): the reply draft asked
"kdaj vam ustreza" although the prospect had already asked when to meet; wanted a booking link, his phone or a call to action.

## What I implemented
`reply.ts`: AI for interested/question/not now with our last e-mail + their answer, `nextStep()` (booking → phone →
ask for number), `cleanReply()` checks, `ai_usage` job `reply`, templates with the same next step; `OWNER_PHONE` variable.

## Test results
Unit 80/80 (+ next step order, reply checks). Integration 49/49 (+ prompt contains their question, our e-mail and the
"do not ask back" rule; draft = model answer + signature; usage logged).

## Deliberate breaks
Phone presence check disabled → `expected 'Pozdravljeni,\n\nkdaj vam ustreza?' to be null` → restored.
