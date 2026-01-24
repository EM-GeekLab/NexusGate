ALTER TYPE "public"."completions_status" ADD VALUE 'cache_hit';--> statement-breakpoint
ALTER TABLE "completions" ADD COLUMN "req_id" varchar(127);--> statement-breakpoint
ALTER TABLE "completions" ADD COLUMN "source_completion_id" integer;--> statement-breakpoint
ALTER TABLE "completions" ADD COLUMN "api_format" varchar(31);--> statement-breakpoint
ALTER TABLE "completions" ADD COLUMN "cached_response" jsonb;--> statement-breakpoint
ALTER TABLE "completions" ADD CONSTRAINT "completions_source_completion_id_completions_id_fk" FOREIGN KEY ("source_completion_id") REFERENCES "public"."completions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "completions_api_key_req_id_unique" ON "completions" ("api_key_id", "req_id") WHERE "req_id" IS NOT NULL;