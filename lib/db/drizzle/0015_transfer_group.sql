ALTER TABLE "transactions" ADD COLUMN "transfer_group_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "transfer_direction" text;
