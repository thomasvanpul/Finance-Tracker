ALTER TABLE "transactions" ADD COLUMN "native_to_base_rate" numeric(18, 8);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "rate_as_of" timestamp with time zone;