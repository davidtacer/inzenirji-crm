CREATE TYPE "public"."draft_kind" AS ENUM('first', 'followup_1', 'followup_2');--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "kind" "draft_kind" DEFAULT 'first' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "drafts_deal_kind_live_uq" ON "drafts" USING btree ("deal_id","kind") WHERE "drafts"."status" <> 'discarded';