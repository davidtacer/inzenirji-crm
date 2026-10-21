ALTER TYPE "public"."draft_kind" ADD VALUE 'extra';--> statement-breakpoint
DROP INDEX "drafts_deal_kind_live_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "drafts_deal_kind_live_uq" ON "drafts" USING btree ("deal_id","kind") WHERE "drafts"."status" <> 'discarded' and "drafts"."kind" in ('first', 'followup_1', 'followup_2');