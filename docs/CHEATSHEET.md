# Cheat sheet (owner)

Never values here — only names and where they live.

## Repo
- GitHub: https://github.com/davidtacer/inzenirji-crm
- Branches: `dev` (work), `main` (production, owner promotes)

## URLs
| Env | URL | Status |
|---|---|---|
| prod | `https://crm.inzenirji.si` | Planned |

## Host
| Env | Host | SSH user | Notes |
|---|---|---|---|
| prod | Hetzner VM `91.99.191.8` (shared with asisto, Postaja dev/prod) | `deploy` | host nginx → kamal-proxy 127.0.0.1:8080; our service `inzenirji-crm`, DB container `inzenirji-crm-db` |

## Secrets (names only)
| Name | Used by | Lives in | Status |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | agents | hosting secret store | Planned |
| `GOOGLE_PLACES_API_KEY` | prospecting | hosting secret store | Planned |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | Calendar, GA4, Search Console, Gmail | hosting secret store | Planned |
| `MAILBOX_PASSWORD` | `david@inzenirji.si` SMTP send + IMAP sync | GitHub env `prod` secret | Planned |
| `POSTGRES_PASSWORD` | Postgres accessory; `DATABASE_URL` is built from it in `.kamal/secrets` | GitHub env `prod` secret | Planned |
| `PROD_HOST` | Kamal server address (`91.99.191.8`) | GitHub env `prod` variable | Planned |
| `BETTER_AUTH_SECRET` | sessions | GitHub env `prod` secret | Planned |
| `DEPLOY_SSH_KEY`, `PROD_SSH_KNOWN_HOSTS` | CI → server (dedicated key) | GitHub env `prod` secret | Planned |
| `OWNER_EMAILS` | login allowlist (comma-separated) | GitHub env `prod` variable | Planned |
| `META_ACCESS_TOKEN` | Meta Ads metrics + lead forms | hosting secret store | Planned |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | prepayments | hosting secret store | Planned |
