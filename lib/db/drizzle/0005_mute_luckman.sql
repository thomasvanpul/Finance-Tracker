CREATE TABLE "shared_expense_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"shared_expense_id" integer NOT NULL,
	"name" text NOT NULL,
	"linked_email" text,
	"linked_user_id" text,
	"share_input" numeric(18, 4),
	"share_amount" numeric(18, 4) NOT NULL,
	"is_payer" text DEFAULT 'false' NOT NULL,
	"status" text DEFAULT 'outstanding' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_expense_settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"participant_id" integer NOT NULL,
	"actor_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"description" text NOT NULL,
	"date" text NOT NULL,
	"total_amount" numeric(18, 4) NOT NULL,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"split_rule" text NOT NULL,
	"notes" text,
	"account_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shared_expense_participants" ADD CONSTRAINT "shared_expense_participants_shared_expense_id_shared_expenses_id_fk" FOREIGN KEY ("shared_expense_id") REFERENCES "public"."shared_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expense_participants" ADD CONSTRAINT "shared_expense_participants_linked_user_id_user_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expense_settlements" ADD CONSTRAINT "shared_expense_settlements_participant_id_shared_expense_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."shared_expense_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expense_settlements" ADD CONSTRAINT "shared_expense_settlements_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expenses" ADD CONSTRAINT "shared_expenses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;