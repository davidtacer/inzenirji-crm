DROP INDEX "drafts_deal_kind_live_uq";--> statement-breakpoint
-- Recreate draft_kind with 'reply' instead of ALTER TYPE ADD VALUE: a new enum value cannot be used
-- in the same transaction, and the indexes below use it (all pending migrations run in one transaction).
ALTER TYPE "public"."draft_kind" RENAME TO "draft_kind_old";--> statement-breakpoint
CREATE TYPE "public"."draft_kind" AS ENUM('first', 'followup_1', 'followup_2', 'reply');--> statement-breakpoint
ALTER TABLE "drafts" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "drafts" ALTER COLUMN "kind" TYPE "public"."draft_kind" USING "kind"::text::"public"."draft_kind";--> statement-breakpoint
ALTER TABLE "drafts" ALTER COLUMN "kind" SET DEFAULT 'first';--> statement-breakpoint
DROP TYPE "public"."draft_kind_old";--> statement-breakpoint
CREATE TYPE "public"."reply_class" AS ENUM('interested', 'not_now', 'no', 'question', 'out_of_office', 'bounce');--> statement-breakpoint
CREATE TABLE "inbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"company_id" uuid NOT NULL,
	"deal_id" uuid,
	"from_email" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"classification" "reply_class" NOT NULL,
	"classified_by" text NOT NULL,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailbox_state" (
	"mailbox" text PRIMARY KEY NOT NULL,
	"uid_validity" text NOT NULL,
	"last_uid" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "message_id" text;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "in_reply_to" text;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_message_id_uq" ON "inbound_messages" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "inbound_company_idx" ON "inbound_messages" USING btree ("company_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "drafts_in_reply_to_uq" ON "drafts" USING btree ("in_reply_to") WHERE "drafts"."in_reply_to" is not null and "drafts"."status" <> 'discarded' and "drafts"."kind" = 'reply';--> statement-breakpoint
CREATE UNIQUE INDEX "drafts_deal_kind_live_uq" ON "drafts" USING btree ("deal_id","kind") WHERE "drafts"."status" <> 'discarded' and "drafts"."kind" <> 'reply';