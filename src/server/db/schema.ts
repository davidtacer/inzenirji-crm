import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Core CRM data model (TASK-003, product spec §4–§5, architecture "Data model").
 * Money in integer cents. Every company has at most one deal (spec §4).
 */

export const dealStage = pgEnum("deal_stage", [
  "found",
  "researched",
  "contacted",
  "replied",
  "call_booked",
  "call_done",
  "proposal_sent",
  "won",
  "lost",
  "nurture",
]);

export const leadSource = pgEnum("lead_source", [
  "places_search",
  "outreach_reply",
  "meta_lead_form",
  "google_ads",
  "website_form",
  "editor_demo",
  "site_audit",
  "referral",
  "partner",
  "manual",
]);

export const offerGroup = pgEnum("offer_group", ["A", "B"]);

export const activityType = pgEnum("activity_type", ["email_in", "email_out", "call", "note", "booking", "stage_change"]);

export const draftStatus = pgEnum("draft_status", ["pending", "approved", "sent", "discarded"]);

/** Outreach sequence step (spec §5.5): day 0, day 3, day 8. */
/** "extra": the first e-mail again, to another address of a company already written to (owner 2026-10-21). */
export const draftKind = pgEnum("draft_kind", ["first", "followup_1", "followup_2", "reply", "extra"]);

/** Classification of an incoming reply (spec §5.5, TASK-009). */
export const replyClass = pgEnum("reply_class", ["interested", "not_now", "no", "question", "out_of_office", "bounce"]);

export const dncKind = pgEnum("dnc_kind", ["email", "domain", "company"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    country: text("country").notNull().default("SI"),
    name: text("name").notNull(),
    category: text("category"),
    address: text("address"),
    city: text("city"),
    phone: text("phone"),
    website: text("website"),
    /** Lower-case host without "www.", used for dedupe and the do-not-contact domain check. */
    websiteDomain: text("website_domain"),
    placeId: text("place_id"),
    /** Google primary type id (e.g. "hair_care"), used for the nearby competitor search (TASK-022). */
    placeType: text("place_type"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    /** Google rating × 10 (4.6 → 46). */
    ratingX10: smallint("rating_x10"),
    reviewCount: integer("review_count"),
    group: offerGroup("offer_group"),
    score: smallint("score"),
    /** Score breakdown shown on the company page (TASK-007). */
    scoreParts: jsonb("score_parts"),
    /** The owner's own trial (demo, form, test sale): kept, but never counted in reports (TASK-016). */
    isTest: boolean("is_test").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("companies_place_id_uq").on(t.placeId),
    index("companies_website_domain_idx").on(t.websiteDomain),
    check("companies_country_iso2", sql`${t.country} ~ '^[A-Z]{2}$'`),
    check("companies_score_range", sql`${t.score} is null or (${t.score} between 0 and 100)`),
    check("companies_rating_range", sql`${t.ratingX10} is null or (${t.ratingX10} between 0 and 50)`),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name"),
    /** Lower-case. Only addresses published by the business or given to us (ADR-007). */
    email: text("email"),
    /** Where the address was found (URL or "given by the person"); required whenever email is set. */
    emailSource: text("email_source"),
    phone: text("phone"),
    role: text("role"),
    /** Marked wrong by the owner (e.g. an aggregator's address): kept so research never adds it back; never e-mailed (ADR-044). */
    invalidAt: timestamp("invalid_at", { withTimezone: true }),
    invalidReason: text("invalid_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contacts_company_email_uq").on(t.companyId, t.email),
    check("contacts_email_lowercase", sql`${t.email} is null or ${t.email} = lower(${t.email})`),
    check("contacts_email_has_source", sql`${t.email} is null or ${t.emailSource} is not null`),
  ],
);

export const competitorLinks = pgTable(
  "competitor_links",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    competitorId: uuid("competitor_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    distanceM: integer("distance_m"),
  },
  (t) => [
    primaryKey({ columns: [t.companyId, t.competitorId] }),
    check("competitor_not_self", sql`${t.companyId} <> ${t.competitorId}`),
  ],
);

export const audits = pgTable(
  "audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** Raw checks (website, freshness, Google profile). Shape is owned by the research module (TASK-006). */
    data: jsonb("data").notNull().default({}),
    issues: jsonb("issues").notNull().default([]),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audits_company_created_idx").on(t.companyId, t.createdAt)],
);

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    stage: dealStage("stage").notNull().default("found"),
    source: leadSource("source").notNull(),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    lostReason: text("lost_reason"),
    valueCents: integer("value_cents"),
    /** "call" = the owner chose to phone this lead instead of e-mailing (ADR-044); null = e-mail when possible. */
    channel: text("channel"),
    /** "Za klic": not reached, show again after this time. */
    callLaterAt: timestamp("call_later_at", { withTimezone: true }),
    /** Agreed call time (TASK-012); Google Calendar sync later. */
    callAt: timestamp("call_at", { withTimezone: true }),
    /** Pre-call brief (AI or rules), shown on the company page and on "Klici". */
    brief: jsonb("brief"),
    briefAt: timestamp("brief_at", { withTimezone: true }),
    /** Latest structured call summary from the owner's notes (scope, wishes, objections, next step, materials). */
    callSummary: jsonb("call_summary"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("deals_company_uq").on(t.companyId),
    index("deals_stage_next_idx").on(t.stage, t.nextActionAt),
    check("deals_value_non_negative", sql`${t.valueCents} is null or ${t.valueCents} >= 0`),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    type: activityType("type").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull().default({}),
  },
  (t) => [index("activities_deal_at_idx").on(t.dealId, t.at)],
);

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    kind: draftKind("kind").notNull().default("first"),
    status: draftStatus("status").notNull().default("pending"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Our Message-ID of the sent e-mail, to match replies (TASK-009). */
    messageId: text("message_id"),
    /** For reply drafts: the prospect's Message-ID we answer (threading). */
    inReplyTo: text("in_reply_to"),
    /** What sending this draft triggers (TASK-014): "project_confirm" starts the guarantee clock of `refId`. */
    /** First e-mails: "ai:<model>" or "predloga: <why AI was not used>" (ADR-045), shown in Osnutki. */
    writtenBy: text("written_by"),
    purpose: text("purpose"),
    refId: uuid("ref_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("drafts_status_idx").on(t.status),
    // One live draft per sequence step and deal; a discarded draft can be prepared again.
    // Replies are exempt (a conversation has many).
    uniqueIndex("drafts_deal_kind_live_uq").on(t.dealId, t.kind).where(sql`${t.status} <> 'discarded' and ${t.kind} in ('first', 'followup_1', 'followup_2')`),
    // One reply draft per incoming message (follow-ups also thread to the first e-mail, so only replies).
    // Only open drafts count: after a reply is sent, a new one (e.g. the proposal) may answer the same message.
    uniqueIndex("drafts_in_reply_to_uq").on(t.inReplyTo).where(sql`${t.inReplyTo} is not null and ${t.status} in ('pending', 'approved') and ${t.kind} = 'reply'`),
    check("drafts_to_lowercase", sql`${t.toEmail} = lower(${t.toEmail})`),
    // A sent draft must have been approved first (ADR-004), enforced by the database too.
    check("drafts_sent_requires_approval", sql`${t.status} <> 'sent' or (${t.approvedAt} is not null and ${t.sentAt} is not null)`),
    check("drafts_approved_has_time", sql`${t.status} not in ('approved','sent') or ${t.approvedAt} is not null`),
  ],
);

export const doNotContact = pgTable(
  "do_not_contact",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: dncKind("kind").notNull(),
    /** Lower-case e-mail, lower-case domain, or the company id as text. */
    value: text("value").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dnc_kind_value_uq").on(t.kind, t.value),
    check("dnc_value_lowercase", sql`${t.value} = lower(${t.value})`),
  ],
);

/*
 * Better Auth core tables (TASK-020). Drizzle keys match Better Auth field names; DB columns are snake_case.
 * auth.int.test.ts has a drift test that fails if Better Auth expects a field that is missing here.
 */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** Paid API calls per provider and day (TASK-005). Reserved before each call; the cap is checked atomically. */
export const apiCalls = pgTable(
  "api_calls",
  {
    provider: text("provider").notNull(),
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.provider, t.day] }), check("api_calls_count_non_negative", sql`${t.count} >= 0`)],
);

/** Every paid AI call (TASK-024): tokens and cost in integer micro-dollars (Anthropic bills in USD). */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job: text("job").notNull(),
    model: text("model").notNull(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costMicroUsd: integer("cost_micro_usd").notNull(),
    ok: boolean("ok").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt), check("ai_usage_cost_non_negative", sql`${t.costMicroUsd} >= 0`)],
);

/** Replies from prospects found in the outreach mailbox (TASK-009). Mail from unknown senders is never stored. */
export const inboundMessages = pgTable(
  "inbound_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: text("message_id").notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    /** "in" = from the prospect, "out" = sent by the owner outside the CRM (Sent folder, TASK-029). */
    direction: text("direction").notNull().default("in"),
    fromEmail: text("from_email").notNull(),
    /** Recipients for outgoing mail. */
    toEmails: text("to_emails"),
    subject: text("subject").notNull().default(""),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    bodyText: text("body_text").notNull().default(""),
    /** Null for outgoing mail. */
    classification: replyClass("classification"),
    /** How it was classified: "rule" or the AI model id. */
    classifiedBy: text("classified_by").notNull(),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("inbound_message_id_uq").on(t.messageId),
    index("inbound_company_idx").on(t.companyId, t.receivedAt),
    check("inbound_direction", sql`${t.direction} in ('in', 'out')`),
    check("inbound_in_has_class", sql`${t.direction} = 'out' or ${t.classification} is not null`),
  ],
);

/** IMAP sync position per mailbox folder. */
export const mailboxState = pgTable("mailbox_state", {
  mailbox: text("mailbox").primaryKey(),
  uidValidity: text("uid_validity").notNull(),
  lastUid: integer("last_uid").notNull().default(0),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Owner settings edited in the CRM (TASK-028): one row per key. Secrets never live here. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Connected Google account for Calendar (TASK-012b, ADR-029). The refresh token is stored encrypted. */
export const googleAccounts = pgTable("google_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  scope: text("scope").notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
});

/** Calendar events with other people (bookings), kept to match them to companies. */
export const calendarEvents = pgTable(
  "calendar_events",
  {
    eventId: text("event_id").primaryKey(),
    summary: text("summary").notNull().default(""),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    attendees: text("attendees").notNull().default(""),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    htmlLink: text("html_link"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("calendar_events_start_idx").on(t.startAt)],
);

/**
 * Everything we know about a company on the web (TASK-031): its site, social profiles, directory entries, and
 * e-mail candidates that could not be verified automatically (kind "email", url = "mailto:…", note = where it was seen).
 */
export const companyLinks = pgTable(
  "company_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    kind: text("kind").notNull(),
    /** google | site | web_search | directory | owner */
    source: text("source").notNull(),
    verified: boolean("verified").notNull().default(false),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("company_links_uq").on(t.companyId, t.url)],
);

export const proposalStatus = pgEnum("proposal_status", ["draft", "sent", "accepted", "declined"]);

/**
 * Proposals (TASK-013, ADR-031). The client sees them at /ponudba/<token> (no login). Money in integer cents.
 * items: [{ label, priceCents }]; materials: string[].
 */
export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    status: proposalStatus("status").notNull().default("draft"),
    title: text("title").notNull(),
    intro: text("intro").notNull().default(""),
    items: jsonb("items").notNull().default([]),
    vatRateBp: integer("vat_rate_bp").notNull().default(2200),
    depositPct: smallint("deposit_pct").notNull().default(50),
    timelineDays: smallint("timeline_days").notNull().default(7),
    materials: jsonb("materials").notNull().default([]),
    validUntil: date("valid_until").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedName: text("accepted_name"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("proposals_token_uq").on(t.token),
    index("proposals_deal_idx").on(t.dealId),
    check("proposals_deposit_range", sql`${t.depositPct} between 0 and 100`),
    check("proposals_accepted_has_name", sql`${t.status} <> 'accepted' or (${t.acceptedAt} is not null and ${t.acceptedName} is not null)`),
  ],
);

export const projectStatus = pgEnum("project_status", ["materials", "in_progress", "launched", "cancelled"]);

/**
 * Projects after the prepayment (TASK-014, ADR-033, spec §5.9 and §8). The client uploads materials at
 * /projekt/<token>. The 7-day clock starts when the confirmation e-mail is SENT (confirmed_at), pauses while we wait
 * for the client (project_pauses) and the deadline = confirmed_at + timeline_days + paused time.
 * materials: [{ label, done, text, doneAt }]
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    proposalId: uuid("proposal_id").references(() => proposals.id, { onDelete: "set null" }),
    token: text("token").notNull(),
    status: projectStatus("status").notNull().default("materials"),
    materials: jsonb("materials").notNull().default([]),
    timelineDays: smallint("timeline_days").notNull().default(7),
    depositCents: integer("deposit_cents"),
    depositPaidAt: timestamp("deposit_paid_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    finalPaidAt: timestamp("final_paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("projects_token_uq").on(t.token), uniqueIndex("projects_deal_uq").on(t.dealId)],
);

export const projectPauses = pgTable(
  "project_pauses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),
    reason: text("reason").notNull(),
  },
  (t) => [
    index("project_pauses_project_idx").on(t.projectId),
    // At most one open pause per project.
    uniqueIndex("project_pauses_open_uq").on(t.projectId).where(sql`${t.endAt} is null`),
  ],
);

/** Files the client uploaded (stored on the server volume, path relative to UPLOAD_DIR). */
export const projectFiles = pgTable(
  "project_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    itemIndex: smallint("item_index").notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    path: text("path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("project_files_project_idx").on(t.projectId)],
);

/** Long work started from the UI (research of one company, batches) that runs in the background (TASK-035). */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** "research_one" | "research_batch" | "research_deepen" */
    kind: text("kind").notNull(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    /** "running" | "done" | "failed" */
    status: text("status").notNull().default("running"),
    total: integer("total").notNull().default(0),
    done: integer("done").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    message: text("message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("jobs_status_idx").on(t.status, t.startedAt), index("jobs_company_idx").on(t.companyId)],
);

/**
 * Weekly report snapshots (TASK-016, ADR-040): one row per week (Monday, Europe/Ljubljana). data = the numbers as
 * they were when the report was made; suggestions = 3 proposals for the coming week (AI or rules).
 */
export const weeklyReports = pgTable("weekly_reports", {
  weekStart: date("week_start").primaryKey(),
  data: jsonb("data").notNull(),
  suggestions: jsonb("suggestions").notNull().default([]),
  /** "rules" or the AI model id. */
  suggestionsBy: text("suggestions_by").notNull().default("rules"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  sendError: text("send_error"),
});

/** Every Google Places query (smart and manual): what was searched and how many new companies it brought (smart search). */
export const placesSearches = pgTable(
  "places_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    query: text("query").notNull(),
    /** Activity key from the catalog; null for a manual query. */
    activity: text("activity"),
    town: text("town"),
    pages: smallint("pages").notNull().default(1),
    found: integer("found").notNull().default(0),
    created: integer("created").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("places_searches_query_idx").on(t.query, t.at), index("places_searches_activity_idx").on(t.activity, t.town)],
);

/** Files attached to an outgoing e-mail (owner 2026-10-20: "potrebujem, da lahko dodajam priponke"); on the upload volume. */
export const draftAttachments = pgTable(
  "draft_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    path: text("path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("draft_attachments_draft_idx").on(t.draftId)],
);

/** Form inquiries held back as spam, scam, insults or tests (owner 2026-10-21); the owner can release one. */
export const heldInquiries = pgTable(
  "held_inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ref: text("ref").notNull().unique(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    message: text("message").notNull(),
    verdict: text("verdict").notNull(),
    reason: text("reason").notNull(),
    lead: jsonb("lead").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (t) => [index("held_inquiries_at_idx").on(t.at), index("held_inquiries_email_idx").on(t.email)],
);

/**
 * A client (or own, or migrated) website built on the Inženirji.si site template (TASK-039, ADR-056).
 * Independent of `projects` (those need a deal and a deposit); `projectId` links the two when there is one.
 * `steps` records the result of each kickoff step so the job can be retried without duplicating anything.
 */
export const siteProjects = pgTable(
  "site_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** client | migration | own */
    kind: text("kind").notNull(),
    /** a-z0-9-, never changed once the repo exists. */
    siteId: text("site_id").notNull(),
    /** setup → brief_ready → cgp → research → design_draft → design_approved → building → preview_ready → handed_over */
    stage: text("stage").notNull().default("setup"),
    stageNote: text("stage_note"),
    domain: text("domain"),
    currentUrl: text("current_url"),
    contact: text("contact"),
    languages: jsonb("languages").notNull().default(["sl"]),
    features: text("features"),
    priceCents: integer("price_cents"),
    deadline: date("deadline"),
    hasCgp: boolean("has_cgp").notNull().default(false),
    /** Facts for the agent (goes into BRIEF.md). */
    notes: text("notes"),
    /** Owner-private notes: never leave the CRM (not in BRIEF.md, not over MCP). */
    ownerNotes: text("owner_notes"),
    /** Why the build started without a deposit. */
    startReason: text("start_reason"),
    briefVersion: integer("brief_version").notNull().default(0),
    repoFullName: text("repo_full_name"),
    guideVersion: text("guide_version"),
    kickoffPrompt: text("kickoff_prompt"),
    steps: jsonb("steps").notNull().default({}),
    links: jsonb("links").notNull().default({}),
    editors: jsonb("editors").notNull().default([]),
    checklist: jsonb("checklist").notNull().default({}),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("site_projects_site_id_uq").on(t.siteId),
    index("site_projects_company_idx").on(t.companyId),
    check("site_projects_kind", sql`${t.kind} in ('client', 'migration', 'own')`),
    check("site_projects_site_id_format", sql`${t.siteId} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("site_projects_stage", sql`${t.stage} in ('setup','brief_ready','cgp','research','design_draft','design_approved','building','preview_ready','handed_over')`),
  ],
);
