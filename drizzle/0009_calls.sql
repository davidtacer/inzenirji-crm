ALTER TABLE "deals" ADD COLUMN "call_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "brief" jsonb;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "brief_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "call_summary" jsonb;