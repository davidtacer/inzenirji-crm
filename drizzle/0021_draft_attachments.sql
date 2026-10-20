CREATE TABLE "draft_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "draft_attachments" ADD CONSTRAINT "draft_attachments_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_attachments_draft_idx" ON "draft_attachments" USING btree ("draft_id");