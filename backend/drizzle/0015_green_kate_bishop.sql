ALTER TABLE "alert_history" DROP CONSTRAINT "alert_history_rule_id_alert_rules_id_fk";
--> statement-breakpoint
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;