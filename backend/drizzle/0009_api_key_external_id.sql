CREATE TYPE "public"."api_key_source" AS ENUM('manual', 'operator', 'init');--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "external_id" varchar(127);--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "source" "api_key_source" DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_external_id_unique" UNIQUE("external_id");