CREATE TYPE "public"."activity_type" AS ENUM('email_in', 'email_out', 'call', 'note', 'booking', 'stage_change');--> statement-breakpoint
CREATE TYPE "public"."deal_stage" AS ENUM('found', 'researched', 'contacted', 'replied', 'call_booked', 'call_done', 'proposal_sent', 'won', 'lost', 'nurture');--> statement-breakpoint
CREATE TYPE "public"."dnc_kind" AS ENUM('email', 'domain', 'company');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('pending', 'approved', 'sent', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('places_search', 'outreach_reply', 'meta_lead_form', 'google_ads', 'website_form', 'editor_demo', 'site_audit', 'referral', 'partner', 'manual');--> statement-breakpoint
CREATE TYPE "public"."offer_group" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"type" "activity_type" NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text DEFAULT 'SI' NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"address" text,
	"city" text,
	"phone" text,
	"website" text,
	"website_domain" text,
	"place_id" text,
	"rating_x10" smallint,
	"review_count" integer,
	"offer_group" "offer_group",
	"score" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_country_iso2" CHECK ("companies"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "companies_score_range" CHECK ("companies"."score" is null or ("companies"."score" between 0 and 100)),
	CONSTRAINT "companies_rating_range" CHECK ("companies"."rating_x10" is null or ("companies"."rating_x10" between 0 and 50))
);
--> statement-breakpoint
CREATE TABLE "competitor_links" (
	"company_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"distance_m" integer,
	CONSTRAINT "competitor_links_company_id_competitor_id_pk" PRIMARY KEY("company_id","competitor_id"),
	CONSTRAINT "competitor_not_self" CHECK ("competitor_links"."company_id" <> "competitor_links"."competitor_id")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text,
	"email" text,
	"email_source" text,
	"phone" text,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_email_lowercase" CHECK ("contacts"."email" is null or "contacts"."email" = lower("contacts"."email")),
	CONSTRAINT "contacts_email_has_source" CHECK ("contacts"."email" is null or "contacts"."email_source" is not null)
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"stage" "deal_stage" DEFAULT 'found' NOT NULL,
	"source" "lead_source" NOT NULL,
	"next_action_at" timestamp with time zone,
	"lost_reason" text,
	"value_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deals_value_non_negative" CHECK ("deals"."value_cents" is null or "deals"."value_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "do_not_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "dnc_kind" NOT NULL,
	"value" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dnc_value_lowercase" CHECK ("do_not_contact"."value" = lower("do_not_contact"."value"))
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" "draft_status" DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drafts_to_lowercase" CHECK ("drafts"."to_email" = lower("drafts"."to_email")),
	CONSTRAINT "drafts_sent_requires_approval" CHECK ("drafts"."status" <> 'sent' or ("drafts"."approved_at" is not null and "drafts"."sent_at" is not null)),
	CONSTRAINT "drafts_approved_has_time" CHECK ("drafts"."status" not in ('approved','sent') or "drafts"."approved_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_links" ADD CONSTRAINT "competitor_links_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_links" ADD CONSTRAINT "competitor_links_competitor_id_companies_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_deal_at_idx" ON "activities" USING btree ("deal_id","at");--> statement-breakpoint
CREATE INDEX "audits_company_created_idx" ON "audits" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_place_id_uq" ON "companies" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "companies_website_domain_idx" ON "companies" USING btree ("website_domain");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_company_email_uq" ON "contacts" USING btree ("company_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "deals_company_uq" ON "deals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "deals_stage_next_idx" ON "deals" USING btree ("stage","next_action_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dnc_kind_value_uq" ON "do_not_contact" USING btree ("kind","value");--> statement-breakpoint
CREATE INDEX "drafts_status_idx" ON "drafts" USING btree ("status");