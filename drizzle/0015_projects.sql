CREATE TYPE "public"."project_status" AS ENUM('materials', 'in_progress', 'launched', 'cancelled');--> statement-breakpoint
CREATE TABLE "project_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"item_index" smallint NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"proposal_id" uuid,
	"token" text NOT NULL,
	"status" "project_status" DEFAULT 'materials' NOT NULL,
	"materials" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timeline_days" smallint DEFAULT 7 NOT NULL,
	"deposit_cents" integer,
	"deposit_paid_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"launched_at" timestamp with time zone,
	"final_paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "ref_id" uuid;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_pauses" ADD CONSTRAINT "project_pauses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_files_project_idx" ON "project_files" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_pauses_project_idx" ON "project_pauses" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_pauses_open_uq" ON "project_pauses" USING btree ("project_id") WHERE "project_pauses"."end_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_token_uq" ON "projects" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_deal_uq" ON "projects" USING btree ("deal_id");