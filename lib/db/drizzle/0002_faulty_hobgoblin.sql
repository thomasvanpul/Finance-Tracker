CREATE TABLE "connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"credential_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connections_user_provider_uniq" ON "connections" USING btree ("user_id","provider");