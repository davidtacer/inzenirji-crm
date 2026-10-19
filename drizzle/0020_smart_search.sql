-- Smart search history; who wrote a first e-mail (AI or template, with the reason).
CREATE TABLE "places_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"activity" text,
	"town" text,
	"pages" smallint DEFAULT 1 NOT NULL,
	"found" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "written_by" text;--> statement-breakpoint
CREATE INDEX "places_searches_query_idx" ON "places_searches" USING btree ("query","at");--> statement-breakpoint
CREATE INDEX "places_searches_activity_idx" ON "places_searches" USING btree ("activity","town");