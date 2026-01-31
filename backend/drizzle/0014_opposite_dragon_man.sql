ALTER TABLE "alert_channels" ADD COLUMN "grafana_uid" varchar(127);--> statement-breakpoint
ALTER TABLE "alert_channels" ADD COLUMN "grafana_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "alert_channels" ADD COLUMN "grafana_sync_error" varchar(500);--> statement-breakpoint
ALTER TABLE "alert_rules" ADD COLUMN "grafana_uid" varchar(127);--> statement-breakpoint
ALTER TABLE "alert_rules" ADD COLUMN "grafana_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD COLUMN "grafana_sync_error" varchar(500);