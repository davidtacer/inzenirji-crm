# Cheat sheet (owner)

Never values here — only names and where they live.

## Repo
- GitHub: https://github.com/davidtacer/inzenirji-crm
- Branches: `dev` (work), `main` (production; the agent promotes, ADR-016)

## URLs
| Env | URL | Status |
|---|---|---|
| prod | `https://crm.inzenirji.si` | Live |

## Host
| Env | Host | SSH user | Notes |
|---|---|---|---|
| prod | Hetzner VM `91.99.191.8` (shared with asisto, Postaja dev/prod) | `deploy` | host nginx → kamal-proxy 127.0.0.1:8080; our service `inzenirji-crm`, DB container `inzenirji-crm-db` |

## Secrets (names only)
| Name | Used by | Lives in | Status |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | AI remark (TASK-024) and later agents | GitHub env `prod` secret | Set by owner 2026-10-15 |
| `GOOGLE_PLACES_API_KEY` | prospecting (restricted to IP 91.99.191.8 + Places API) | GitHub env `prod` secret | Set by owner 2026-10-15 |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | Calendar, GA4, Search Console, Gmail | hosting secret store | Planned |
| `SMTP_PASSWORD` | `hello@inzenirji.si` — login e-mails (ADR-015) | GitHub env `prod` secret | Set by owner 2026-10-15 |
| `OUTREACH_SMTP_PASSWORD` | `david@inzenirji.si` SMTP send (outreach, TASK-008); later also IMAP sync (TASK-009) | GitHub env `prod` secret | Not set yet — set when DKIM passes |
| `OUTREACH_ENABLED` | `1` switches outreach sending on (ADR-019); anything else = locked | GitHub env `prod` **variable** | Not set (locked) — set to `1` only after mail-tester shows DKIM signed |
| `POSTGRES_PASSWORD` | Postgres accessory; `DATABASE_URL` is built from it in `.kamal/secrets` | GitHub env `prod` secret | Planned |
| `PROD_HOST` | Kamal server address (`91.99.191.8`) | GitHub env `prod` variable | Planned |
| `BETTER_AUTH_SECRET` | sessions | GitHub env `prod` secret | Planned |
| `DEPLOY_SSH_KEY`, `PROD_SSH_KNOWN_HOSTS` | CI → server (dedicated key) | GitHub env `prod` secret | Planned |
| `OWNER_EMAILS` | login allowlist (comma-separated) | GitHub env `prod` variable | Planned |
| `META_ACCESS_TOKEN` | Meta Ads metrics + lead forms | hosting secret store | Planned |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | prepayments | hosting secret store | Planned |
