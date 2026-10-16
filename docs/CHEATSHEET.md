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

## Settings in the CRM (not env)
Sending on/off, e-mails per day, booking link, phone, AI budget, Google calls per day: https://crm.inzenirji.si/nastavitve (ADR-026).
Leads key (editor demo + inzenirji.si form → CRM, ADR-034/035): Nastavitve → Leadi s spleta → Ustvari ključ → paste into (1) the editor Worker secret `CRM_LEADS_TOKEN` (Cloudflare → Workers & Pages → inzenirji-editor-dev → Settings → Variables and Secrets) and (2) Vercel env `CRM_LEADS_TOKEN` of the inzenirji.si project, then redeploy.

## Secrets (names only)
| Name | Used by | Lives in | Status |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | AI remark (TASK-024) and later agents | GitHub env `prod` secret | Set by owner 2026-10-15 |
| `GOOGLE_PLACES_API_KEY` | prospecting (restricted to IP 91.99.191.8 + Places API) | GitHub env `prod` secret | Set by owner 2026-10-15 |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google sign-in for Calendar (later GA4, Search Console); the refresh token is stored encrypted in the DB after "Poveži Google Koledar" (ADR-029) | GitHub env `prod` secrets | To be set by owner |
| `SMTP_PASSWORD` | `hello@inzenirji.si` — login e-mails (ADR-015) | GitHub env `prod` secret | Set by owner 2026-10-15 |
| `OUTREACH_SMTP_PASSWORD` | `david@inzenirji.si` SMTP send (TASK-008) and IMAP read (TASK-009) | GitHub env `prod` secret | Set by owner 2026-10-15 |
| `POSTGRES_PASSWORD` | Postgres accessory; `DATABASE_URL` is built from it in `.kamal/secrets` | GitHub env `prod` secret | Planned |
| `PROD_HOST` | Kamal server address (`91.99.191.8`) | GitHub env `prod` variable | Planned |
| `BETTER_AUTH_SECRET` | sessions | GitHub env `prod` secret | Planned |
| `DEPLOY_SSH_KEY`, `PROD_SSH_KNOWN_HOSTS` | CI → server (dedicated key) | GitHub env `prod` secret | Planned |
| `OWNER_EMAILS` | login allowlist (comma-separated) | GitHub env `prod` variable | Planned |
| `META_ACCESS_TOKEN` | Meta Ads metrics + lead forms | hosting secret store | Planned |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | prepayments | hosting secret store | Planned |

## Google OAuth client (Calendar, ADR-029)
Google Cloud Console → project → APIs & Services: enable **Google Calendar API**; **OAuth consent screen**: External,
app name "Inženirji CRM", support e-mail, test user = the owner's Google account; **Credentials → Create credentials →
OAuth client ID → Web application**, authorised redirect URI `https://crm.inzenirji.si/api/google/callback`. Put the
client ID and secret into GitHub env `prod` as `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`, redeploy, then
Nastavitve → "Poveži Google Koledar".

## Gemini API key (Google pregled, ADR-039)
aistudio.google.com/apikey → **Create API key** (key starts with `AIza`). Paste it in CRM → Nastavitve → "Google pregled
(Gemini)" (stored encrypted in `settings`, not in env). Model default `gemini-flash-latest`, changeable there. If Gemini
reports a quota error, enable billing on the key's project (first 5,000 grounded searches a month are free).
