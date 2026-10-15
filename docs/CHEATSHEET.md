# Cheat sheet (owner)

Never values here — only names and where they live.

## Repo
- GitHub: https://github.com/davidtacer/inzenirji-crm
- Branches: `dev` (work), `main` (production, owner promotes)

## URLs
| Env | URL | Status |
|---|---|---|
| prod | `crm.inzenirji.si` (proposed) | Planned |

## Secrets (names only)
| Name | Used by | Lives in | Status |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | agents | hosting secret store | Planned |
| `GOOGLE_PLACES_API_KEY` | prospecting | hosting secret store | Planned |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | Calendar, GA4, Search Console, Gmail | hosting secret store | Planned |
| `SMTP_PASSWORD` / mailbox credentials | outreach sending + sync | hosting secret store | Planned (mailbox open) |
| `META_ACCESS_TOKEN` | Meta Ads metrics + lead forms | hosting secret store | Planned |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | prepayments | hosting secret store | Planned |
