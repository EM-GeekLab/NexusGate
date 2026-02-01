CREATE TYPE "public"."alert_channel_type" AS ENUM('webhook', 'email', 'feishu');--> statement-breakpoint
CREATE TYPE "public"."alert_history_status" AS ENUM('sent', 'failed', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."alert_rule_type" AS ENUM('budget', 'error_rate', 'latency', 'quota');--> statement-breakpoint
CREATE TABLE "alert_channels" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alert_channels_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL,
	"type" "alert_channel_type" NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alert_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"rule_id" integer NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"payload" jsonb NOT NULL,
	"status" "alert_history_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alert_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL,
	"type" "alert_rule_type" NOT NULL,
	"condition" jsonb NOT NULL,
	"channel_ids" integer[] NOT NULL,
	"cooldown_minutes" integer DEFAULT 60 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE no action ON UPDATE no action;