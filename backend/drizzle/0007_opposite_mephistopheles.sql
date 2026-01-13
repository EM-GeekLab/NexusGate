CREATE TYPE "public"."provider_type" AS ENUM('openai', 'openai-responses', 'anthropic', 'azure', 'ollama');--> statement-breakpoint
ALTER TABLE "providers" ALTER COLUMN "type" SET DEFAULT 'openai'::"public"."provider_type";--> statement-breakpoint
ALTER TABLE "providers" ALTER COLUMN "type" SET DATA TYPE "public"."provider_type" USING "type"::"public"."provider_type";--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "api_version" varchar(31);