CREATE TABLE "site_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"kind" text NOT NULL,
	"site_id" text NOT NULL,
	"stage" text DEFAULT 'setup' NOT NULL,
	"stage_note" text,
	"domain" text,
	"current_url" text,
	"contact" text,
	"languages" jsonb DEFAULT '["sl"]'::jsonb NOT NULL,
	"features" text,
	"price_cents" integer,
	"deadline" date,
	"has_cgp" boolean DEFAULT false NOT NULL,
	"notes" text,
	"owner_notes" text,
	"start_reason" text,
	"brief_version" integer DEFAULT 0 NOT NULL,
	"repo_full_name" text,
	"guide_version" text,
	"kickoff_prompt" text,
	"steps" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"editors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_projects_kind" CHECK ("site_projects"."kind" in ('client', 'migration', 'own')),
	CONSTRAINT "site_projects_site_id_format" CHECK ("site_projects"."site_id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "site_projects_stage" CHECK ("site_projects"."stage" in ('setup','brief_ready','cgp','research','design_draft','design_approved','building','preview_ready','handed_over'))
);
--> statement-breakpoint
ALTER TABLE "site_projects" ADD CONSTRAINT "site_projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_projects" ADD CONSTRAINT "site_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_projects_site_id_uq" ON "site_projects" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "site_projects_company_idx" ON "site_projects" USING btree ("company_id");