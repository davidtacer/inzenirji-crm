ALTER TABLE "inbound_messages" ALTER COLUMN "classification" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD COLUMN "direction" text DEFAULT 'in' NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD COLUMN "to_emails" text;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_direction" CHECK ("inbound_messages"."direction" in ('in', 'out'));--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_in_has_class" CHECK ("inbound_messages"."direction" = 'out' or "inbound_messages"."classification" is not null);