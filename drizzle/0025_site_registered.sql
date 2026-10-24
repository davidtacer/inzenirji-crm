ALTER TABLE "site_projects" ADD COLUMN "registered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site_projects" ADD COLUMN "legacy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site_projects" ADD COLUMN "hosting" text;--> statement-breakpoint
ALTER TABLE "site_projects" ADD COLUMN "editor_state" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_projects" ADD CONSTRAINT "site_projects_editor_state" CHECK ("site_projects"."editor_state" in ('none','planned','active'));