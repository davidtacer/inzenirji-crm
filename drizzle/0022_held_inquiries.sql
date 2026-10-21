CREATE TABLE "held_inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"message" text NOT NULL,
	"verdict" text NOT NULL,
	"reason" text NOT NULL,
	"lead" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "held_inquiries_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE INDEX "held_inquiries_at_idx" ON "held_inquiries" USING btree ("at");--> statement-breakpoint
CREATE INDEX "held_inquiries_email_idx" ON "held_inquiries" USING btree ("email");