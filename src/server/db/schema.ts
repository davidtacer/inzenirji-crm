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
    status: draftStatus("status").notNull().default("pending"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("drafts_status_idx").on(t.status),
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
