# TASK-030 — feedback

Owner 2026-10-16: "dajmo neke filtre in search na to stran" (/podjetja).

## What I implemented
`parseCompanyQuery` + `listCompanies(query)` with total and `companyCities`; GET filter form (search, stage, group, city,
e-mail, own site, sort, min score, good business), presets incl. "Pripravljena za e-mail" and "Brez e-naslova (za klic)";
old `?f=` links still work.

## Test results
Integration 59/59 (+ search by name/e-mail, LIKE characters escaped, each filter, sort, legacy chip, total, bad values ignored).

## Deliberate breaks
"e-mail: no" filter removed → test fails → restored.
