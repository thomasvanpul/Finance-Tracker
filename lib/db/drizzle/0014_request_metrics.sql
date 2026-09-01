CREATE TABLE "request_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"route" text NOT NULL,
	"method" text NOT NULL,
	"status_code" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"user_id" text
);
--> statement-breakpoint
CREATE INDEX "request_metrics_ts_idx" ON "request_metrics" USING btree ("ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "request_metrics_route_ts_idx" ON "request_metrics" USING btree ("route","ts" DESC NULLS LAST);