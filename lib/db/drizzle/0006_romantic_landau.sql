CREATE TABLE "nw_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"month" text NOT NULL,
	"cash" numeric(18, 4) NOT NULL,
	"investment" numeric(18, 4) NOT NULL,
	"pension" numeric(18, 4) NOT NULL,
	"property" numeric(18, 4) NOT NULL,
	"other" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nw_snapshots" ADD CONSTRAINT "nw_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nw_snapshots_user_month_unique" ON "nw_snapshots" USING btree ("user_id","month");