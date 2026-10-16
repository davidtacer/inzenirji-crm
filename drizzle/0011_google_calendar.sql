CREATE TABLE "calendar_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"attendees" text DEFAULT '' NOT NULL,
	"company_id" uuid,
	"html_link" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"scope" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "google_accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_start_idx" ON "calendar_events" USING btree ("start_at");