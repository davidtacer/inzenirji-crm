# Cloudflare setup for a client site (runbook)

The same procedure for every site on our system. The CRM shows it per site with the names filled in
(Strani → site → "Ročni koraki", `src/server/sites/checklist.ts`). This file is the reference and the explanation.

## The one rule: preview on the client's own domain
The `dev` branch is always served at **`https://dev.<client domain>`** (e.g. `https://dev.vodniskuter.si`).
Never give the client (or the editor) a `*.pages.dev` or `*.workers.dev` address: Chrome's lookalike check flags
names such as `vodniskuter-si-dev.pages.dev` or `dev-vodniskuter-si.<account>.workers.dev` as a fake of
`vodniskuter.si` ("Did you mean vodniskuter.si? The site looks fake"). A subdomain of the real domain is the same
site, so there is no warning. Found on vodniskuter.si on 2026-10-24.
`editor.config.json → urls.dev` and `inzenirji-editor-config/sites/<id>/site.json → dev` hold this URL
(the CRM kickoff writes `https://dev.<domain>`; `https://<id>-dev.pages.dev` only as a placeholder while the domain is unknown).

## A. New sites from the template (Cloudflare Pages)
1. **Domain on Cloudflare first.** Add the domain (Free plan), check the imported records (A/CNAME of the current
   site, MX for e-mail), switch the nameservers at the registrar. The current site and e-mail keep working.
   If the client keeps DNS elsewhere: CNAME `dev.<domain>` → `<id>-dev.pages.dev` there (and `www` → `<id>.pages.dev` at launch).
2. **Two Pages projects** from the site repo: `<id>` (production branch `main`) and `<id>-dev` (production branch `dev`).
   Preset Next.js (Static HTML Export), build `npm run build`, output `out`, `NODE_VERSION=22`.
   Settings → Builds → Preview branches: None in both.
3. **Custom domain** `dev.<domain>` on `<id>-dev`. At launch only: `<domain>` and `www.<domain>` on `<id>`.
4. Check: `https://dev.<domain>` loads, `/robots.txt` has `Disallow: /`, `/uredi` shows the "coming soon" page.
   The template decides dev vs live by `CF_PAGES_BRANCH` (only `main` is live: indexable, GA4 after consent).
5. Build notifications (Pages → Deployment events → editor webhook), editors, GA4: see the CRM card.

## B. Sites on Cloudflare Workers (static assets + a small Worker), e.g. vodniskuter.si
Built before the template; the form needs a Worker (`/api/*`). Same rule, different mechanics:
1. Domain on Cloudflare (as above).
2. Production Worker `<id>`: Workers Builds connected to the repo, production branch `main`,
   build `npm run build`, deploy `npx wrangler deploy`, custom domain `<domain>`.
3. Dev Worker `<id>-dev`: Create → Import a repository → same repo, **name `<id>-dev`**, build `npm run build`,
   deploy **`npx wrangler deploy --env dev`**, then Settings → Builds → production branch **`dev`**.
   `wrangler.jsonc → env.dev` holds: `workers_dev: false`, `preview_urls: false`,
   `routes: [{ pattern: "dev.<domain>", custom_domain: true }]` and preview-safe `vars` (`*.invalid` addresses, no secrets,
   so the form cannot send mail). Wrangler creates the DNS record `dev` (type Worker) itself.
4. The build sets `SITE_ENV=dev` from `WORKERS_CI_BRANCH` (`scripts/with-env.mjs`): noindex, `Disallow: /`, no analytics.
5. Do not use Workers "Builds for Preview branches" for this: `wrangler preview` (beta) needs a `previews` block and
   gives a `*.workers.dev` URL (lookalike warning); `wrangler versions upload` fails in that mode with a name mismatch.
   Turn it off in the production Worker (Settings → Builds → Previews Base).

## Troubleshooting
- `DNS_PROBE_FINISHED_NXDOMAIN` right after adding `dev.<domain>`: the record exists (DNS → Records shows `dev`),
  the computer cached "does not exist". Try a phone on mobile data; on macOS
  `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder` and Chrome `chrome://net-internals/#dns` → Clear host cache.
- Build fails at the deploy step with "name … must match the name of your Worker": the Worker name in Cloudflare and the
  name wrangler computes (`<name>` or `<name>-<env>`) differ, or the dev Worker built `main` (no `env.dev` there yet).
  Set the production branch of the dev Worker to `dev` and retry.
