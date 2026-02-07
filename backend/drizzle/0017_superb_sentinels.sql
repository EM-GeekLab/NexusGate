CREATE TYPE "public"."playground_message_role" AS ENUM('system', 'user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."playground_test_result_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "playground_conversations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "playground_conversations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" varchar(255) NOT NULL,
	"model" varchar(63) NOT NULL,
	"api_key_id" integer,
	"params" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playground_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "playground_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversation_id" integer NOT NULL,
	"role" "playground_message_role" NOT NULL,
	"content" varchar NOT NULL,
	"completion_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playground_test_cases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "playground_test_cases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" varchar(255) NOT NULL,
	"description" varchar,
	"messages" jsonb NOT NULL,
	"params" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playground_test_results" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "playground_test_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"test_run_id" integer NOT NULL,
	"model" varchar(63) NOT NULL,
	"status" "playground_test_result_status" DEFAULT 'pending' NOT NULL,
	"response" varchar,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"ttft" integer,
	"duration" integer,
	"error_message" varchar,
	"completion_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playground_test_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "playground_test_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"test_case_id" integer NOT NULL,
	"api_key_id" integer,
	"models" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playground_conversations" ADD CONSTRAINT "playground_conversations_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_messages" ADD CONSTRAINT "playground_messages_conversation_id_playground_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."playground_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_messages" ADD CONSTRAINT "playground_messages_completion_id_completions_id_fk" FOREIGN KEY ("completion_id") REFERENCES "public"."completions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_test_results" ADD CONSTRAINT "playground_test_results_test_run_id_playground_test_runs_id_fk" FOREIGN KEY ("test_run_id") REFERENCES "public"."playground_test_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_test_results" ADD CONSTRAINT "playground_test_results_completion_id_completions_id_fk" FOREIGN KEY ("completion_id") REFERENCES "public"."completions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_test_runs" ADD CONSTRAINT "playground_test_runs_test_case_id_playground_test_cases_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "public"."playground_test_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_test_runs" ADD CONSTRAINT "playground_test_runs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;