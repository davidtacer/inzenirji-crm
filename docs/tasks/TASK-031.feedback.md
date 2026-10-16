# TASK-031 — feedback

Owner 2026-10-16 (Frizerski salon FANTAZIJA): Google profile without website; a web search shows Instagram, a Wix site
and najdi.si with the real site and e-mail. Research must find as much as possible and store everything.

## What I implemented
`callClaudeWithSearch` (web search tool, pause_turn, search cost), `src/server/research/websearch.ts` (`findOnWeb`,
`pageMatches`), migration 0012 `company_links`, research integration (search first when no own site, else only when no
e-mail; site switch; links from Google/site/bizi/web; verified e-mails as contacts; candidates), usage log, setting
"Iskanje po spletu", "Na spletu" box with one-click candidate confirmation, research message, audit v4.

## Test results
Unit 88/88 (+ page matching by phone / address / name+city, negatives). Integration 61/61 (+ Fantazija case: site found
and verified, group A, verified e-mail from the site, najdi.si verified, Instagram stored unverified and not opened,
Wix not matching → unverified, Gmail candidate, legal name, cost 44 000 µ$ incl. 2 searches; wrong-business site
rejected; no call when the budget is used).

## Deliberate breaks
Page verification disabled (any page accepted) → wrong business's site and e-mail accepted, test fails → restored.

## NOT RUN
Real web search (sandbox has no key/internet) — owner re-researches Fantazija on prod.
