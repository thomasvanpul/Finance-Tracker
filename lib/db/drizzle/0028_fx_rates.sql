CREATE TABLE "fx_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"provider" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rates_date_pair_provider_uniq" ON "fx_rates" USING btree ("date","base","quote","provider");