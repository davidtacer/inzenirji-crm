-- ADR-044: wrong e-mails are kept but marked invalid; deals can be moved to the phone channel.
ALTER TABLE "contacts" ADD COLUMN "invalid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "invalid_reason" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "call_later_at" timestamp with time zone;