CREATE TABLE "eod_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"session_date" date NOT NULL,
	"close" numeric(18, 6) NOT NULL,
	"currency" text NOT NULL,
	"provider" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "eod_prices_ticker_session_uniq" ON "eod_prices" USING btree ("ticker","session_date");