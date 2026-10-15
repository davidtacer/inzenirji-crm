CREATE TABLE "api_calls" (
	"provider" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_calls_provider_day_pk" PRIMARY KEY("provider","day"),
	CONSTRAINT "api_calls_count_non_negative" CHECK ("api_calls"."count" >= 0)
);
