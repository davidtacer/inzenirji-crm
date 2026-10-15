# Product spec — Inženirji.si AI CRM

Status labels: **Live** · **Built** · **Planned**. Everything below is **Planned** (2026-10-15).
Business context and numbers: `inzenirji.si` repo, `docs/nacrt-rasti.md` (Slovenian).

## 1. Goal
Help one person (the owner) sell and deliver **10 websites per month** by January 2027: the CRM does the
repetitive work (finding, researching, drafting, following up, reporting), the owner does calls and approvals.

## 2. Offer the CRM sells (context)
- **Group A — "has a site but can't edit it":** move the existing site to our framework with the conversational
  editor. Price is **individual per client**, set after reviewing the site; never stated in outreach.
- **Group B — "needs a new site / has none":** new site, 590 € + VAT one-off, launched in 7 days.
- **7-day guarantee:** "If the site is not online within 7 days of receiving all required materials, we refund the
  prepayment." The clock starts only when the agreed materials checklist is complete and we confirmed it in writing;
  it pauses while we wait for the client and does not cover third-party delays or extra features (§8).
- Public sales line "2 new clients per week" is marketing; real capacity is not limited by it.

## 3. Users
Owner (David). Later: additional internal users with the same role. No client-facing UI in this repo
(client-facing pieces: the landing site and the editor).

## 4. Pipeline
Every lead is a **company** with one **deal**. Stages:

`found → researched → contacted → replied → call_booked → call_done → proposal_sent → won | lost | nurture`

- `won` = prepayment received. Then a **project** starts (§8).
- `nurture` = "not now"; the CRM proposes a re-contact date.
- Group (`A`/`B`) is set during research and can be changed by the owner.

Lead sources (stored on the deal): `places_search`, `outreach_reply`, `meta_lead_form`, `google_ads`,
`website_form`, `editor_demo`, `site_audit`, `referral`, `partner`, `manual`.

## 5. Modules

### 5.1 Prospecting (Google Places)
- Search by region × category (Slovenia first; country is a field from day one).
- Store place id, name, address, phone, website, rating, review count, opening hours, categories, Maps URL.
- Deduplicate by place id, website domain and phone.
- Selection rule (default, configurable): rating ≥ 4.3 and ≥ 30 reviews (a working business) and a weak or
  missing website.
- Budget guard: daily cap on API calls; stay within the free monthly quota unless the owner raises it.

### 5.2 Due diligence (research)
Per company, stored as a dated **audit** snapshot:
- Website: CMS and version hints, copyright year, mobile test, load speed on phone, SEO basics (title, description,
  headings), structured data, "AI visibility" (clear facts: what, where, prices, FAQ), broken links, HTTPS.
- Freshness: expired promotions, last-season menus, mismatches with the Google profile (opening hours, phone,
  address). These become the personal remark in outreach.
- Google profile: rating, review count, recent review themes.
- Social profiles found on the site (links only).
- Public company data where allowed (legal form, registration).
- **Competitors:** 3–5 nearest businesses in the same category with the same audit, for comparison.
- Output: a short summary, a list of concrete problems, and a group (A/B) proposal.

### 5.3 Lead scoring
Score 0–100 from business quality (rating, reviews), website weakness, category fit, size signals and engagement
(reply, demo use, site audit). The home screen shows today's top 10.

### 5.4 Mockups (on demand only)
The existing mockup pipeline (custom design from the client's real content + desktop/mobile screenshots) is a
module the owner **starts manually** for a chosen lead. The owner always reviews the result before it is used.

### 5.5 Outreach and e-mail
- Sender: `david@inzenirji.si`, written and signed in the first person as David (ADR-013); warm-up and limits are enforced in code.
- Cold e-mail only to **e-mail addresses published by the business** (website, Google profile, public directories);
  the source of each address is stored.
- Sequence: day 0 first e-mail → day 3 short follow-up with a new fact → day 8 last follow-up → optional call task.
- Personalisation: one concrete remark from the audit, a competitor comparison, for group A a link to the public
  editor demo; mockup attached only when one was made.
- Every e-mail has a one-sentence opt-out. An opt-out or "no" adds the address and company to **do-not-contact**.
- Mailbox sync: incoming replies are matched to the company, classified (`interested`, `not_now`, `no`,
  `question`, `out_of_office`, `bounce`) and a reply draft is prepared.
- Volume guard: daily send cap (start ~12/day), warm-up, bounce-rate stop.
- **All outbound messages are drafts until the owner approves** (ADR-004).

### 5.6 Inbound leads
Meta lead forms, the website inquiry form, editor demo sign-ups, site-audit requests and Google Ads conversions
create or update a company + deal immediately and trigger research. Target: first reply drafted within minutes,
sent (after approval) within 1 hour during working hours.

### 5.7 Calls (Google Calendar)
- Booking through Google Calendar appointment schedules (free tier); the CRM reads new bookings via the Calendar
  API and attaches them to the deal.
- **Pre-call brief** (one screen, also e-mailed to the owner before the call): what the business does, what is wrong
  with the site, competitors, likely objections, proposed offer.
- **Call notes:** the owner pastes or dictates notes; the CRM extracts scope, next steps and a proposal draft.

### 5.8 Proposals, prepayment, invoices
- Proposal draft (PDF + e-mail) from call notes: scope, price, timeline, materials checklist, guarantee terms.
- 50 % prepayment via Stripe link or bank transfer; status tracked; remaining 50 % at launch.
- Invoices for David Tacer s.p. (content and VAT handling to be confirmed with the accountant before go-live).

### 5.9 Onboarding and production (projects)
- On `won` a **project** is created with the **materials checklist** agreed in the proposal: texts (or permission
  to write them), logo, photos, price list / services, contacts and opening hours, languages, domain/DNS access,
  for group A access to the existing site.
- Client upload form; reminders when something is missing.
- When the checklist is complete, the CRM drafts the confirmation e-mail "We have everything, your site will be
  online by <date>" — sending it **starts the 7-day guarantee clock**.
- Clock pauses (with a logged reason) while waiting for the client; shows days left; alerts the owner on day 5.
- Launch checklist; at launch: remaining 50 %, Google review request, editor onboarding.

### 5.10 After launch
- Google review request, NPS, referral request (referral program terms: open decision).
- Editor usage from `inzenirji-widget`: owners who never edit → offer help; heavy users → upsell.
- Upsells: extra language, bookings, shop, Google profile, credit packs, **Postaja for the client** (so the client
  can post to social networks themselves; we pre-fill it with their site content; price/model open).
- Content freshness alerts (shared idea with the editor's "skrbnik strani").

### 5.11 Postaja (Inženirji.si brand only)
For every finished project the CRM adds material to the **Inženirji.si** brand in Postaja: what we built,
before/after screenshots, category, timeline, client quote (with permission). Postaja turns it into our posts and
ads. We never prepare posts for clients here.

### 5.12 Reporting and analysis
- **Meta Ads:** spend, CPL, CTR, per creative and campaign (A: editor, B: new site), leads → calls → sales.
- **Google Analytics 4:** visits per page (home, /urejevalnik, demo, audit), conversions (CTA clicks, forms, demo
  sign-ups), sources.
- **Google Search Console:** queries, impressions, clicks, pages.
- **Win/loss analysis:** why deals were won or lost, which remarks and categories get replies.
- **Weekly report** (Monday 08:00 Europe/Ljubljana, e-mail + page): funnel per channel, sales, revenue, ad and AI
  cost, CAC, what worked, 3 proposals for the week.

### 5.13 Multi-market
Country, language, currency and legal notes are fields from day one, so a new market (HR, AT, DE) is configuration,
not a new system.

## 6. KPIs shown on the dashboard
New leads/week (target 30+), calls/week (7–8), sales/month (10), time to first reply (< 1 h), time to proposal
(< 24 h), CAC (< 150 €), sites launched within the guarantee (100 %), demo visitor → e-mail (> 15 %).

## 7. Human in the loop
First 4 weeks: nothing is sent automatically. Later the owner may enable auto-send per category (e.g. day-3
follow-up) by ADR; the first e-mail to a new prospect and every proposal always need approval.

## 8. Guarantee rules (exact)
- Clock start: timestamp of the sent confirmation e-mail (§5.9). Not before.
- Pauses: every period where the next step is the client's (question unanswered, review feedback pending, DNS
  access missing, scope change requested). Each pause has start, end, reason.
- Excluded: delays of third parties we do not control (domain transfer at a registrar, external services) and extra
  features agreed separately (bookings, shop).
- Deadline = start + 7 calendar days + paused time. The project page shows it at all times.

## 9. Open questions
- ~~Which mailbox sends outreach~~ — answered by ADR-013: `david@inzenirji.si`, first-person.
- Referral program reward (credit vs. cash). Postaja upsell price/model.
- Conversation and research data retention period.
