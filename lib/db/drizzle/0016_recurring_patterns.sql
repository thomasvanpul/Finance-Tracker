CREATE TABLE "recurring_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"normalized_key" text NOT NULL,
	"display_name" text NOT NULL,
	"interval_days" integer NOT NULL,
	"expected_amount" numeric(18, 4) NOT NULL,
	"currency" text NOT NULL,
	"last_occurrence" date NOT NULL,
	"next_expected" date,
	"occurrence_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_patterns" ADD CONSTRAINT "recurring_patterns_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_patterns_user_key_uniq" ON "recurring_patterns" USING btree ("user_id","normalized_key");
