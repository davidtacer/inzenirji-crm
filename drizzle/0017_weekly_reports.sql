-- TASK-016: weekly report snapshots (one row per Monday, Europe/Ljubljana).
CREATE TABLE "weekly_reports" (
	"week_start" date PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggestions_by" text DEFAULT 'rules' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"send_error" text
);
