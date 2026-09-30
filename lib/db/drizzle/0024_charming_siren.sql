CREATE TABLE "provider_health" (
	"name" text PRIMARY KEY NOT NULL,
	"breaker" text DEFAULT 'closed' NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"cooldown_until" timestamp with time zone,
	"last_ok" timestamp with time zone,
	"last_error_message" text,
	"last_error_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
