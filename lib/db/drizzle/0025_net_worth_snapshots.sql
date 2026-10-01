CREATE TABLE "net_worth_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"base_currency" text NOT NULL,
	"assets" numeric(18, 4) NOT NULL,
	"portfolio" numeric(18, 4) NOT NULL,
	"liabilities" numeric(18, 4) NOT NULL,
	"owing_net" numeric(18, 4) NOT NULL,
	"net_worth" numeric(18, 4) NOT NULL,
	"partial" boolean NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "net_worth_snapshots_user_date_uniq" ON "net_worth_snapshots" USING btree ("user_id","date");