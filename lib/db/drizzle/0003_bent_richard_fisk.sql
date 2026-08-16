ALTER TABLE "accounts" ADD COLUMN "external_provider" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "external_id" text;--> statement-breakpoint
-- Backfill so existing Wise-synced rows carry provider-agnostic identity.
-- Non-Wise rows (manual, CSV-imported) stay null and re-sync into the
-- new columns whenever they next flow through connection-sync.ts.
UPDATE "accounts" SET "external_provider" = 'wise', "external_id" = "wise_balance_id" WHERE "wise_balance_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_provider_external_uniq" ON "accounts" USING btree ("user_id","external_provider","external_id");