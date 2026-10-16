CREATE TYPE "public"."proposal_status" AS ENUM('draft', 'sent', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"token" text NOT NULL,
	"status" "proposal_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"vat_rate_bp" integer DEFAULT 2200 NOT NULL,
	"deposit_pct" smallint DEFAULT 50 NOT NULL,
	"timeline_days" smallint DEFAULT 7 NOT NULL,
	"materials" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"valid_until" date NOT NULL,
	"sent_at" timestamp with time zone,
	"first_viewed_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_deposit_range" CHECK ("proposals"."deposit_pct" between 0 and 100),
	CONSTRAINT "proposals_accepted_has_name" CHECK ("proposals"."status" <> 'accepted' or ("proposals"."accepted_at" is not null and "proposals"."accepted_name" is not null))
);
--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_token_uq" ON "proposals" USING btree ("token");--> statement-breakpoint
CREATE INDEX "proposals_deal_idx" ON "proposals" USING btree ("deal_id");