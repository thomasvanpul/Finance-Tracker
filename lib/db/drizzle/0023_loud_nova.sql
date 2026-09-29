DROP INDEX "connections_user_provider_uniq";--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "external_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "connections_user_provider_external_uniq" ON "connections" USING btree ("user_id","provider","external_id");