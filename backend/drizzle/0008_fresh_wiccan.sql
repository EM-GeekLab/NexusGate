ALTER TABLE "api_keys" ADD COLUMN "rpm_limit" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "tpm_limit" integer DEFAULT 50000 NOT NULL;