ALTER TABLE "connections" ADD COLUMN "institution" text;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "format" text;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_user_account_extid_uniq" ON "transactions" USING btree ("user_id","account_id","external_id");