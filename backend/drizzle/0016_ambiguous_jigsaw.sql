ALTER TABLE "providers" ADD COLUMN "proxy_url" varchar(255);--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "proxy_enabled" boolean DEFAULT false NOT NULL;