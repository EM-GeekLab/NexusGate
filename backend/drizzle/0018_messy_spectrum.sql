ALTER TABLE "playground_conversations" DROP CONSTRAINT "playground_conversations_api_key_id_api_keys_id_fk";
--> statement-breakpoint
ALTER TABLE "playground_messages" DROP CONSTRAINT "playground_messages_conversation_id_playground_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "playground_messages" DROP CONSTRAINT "playground_messages_completion_id_completions_id_fk";
--> statement-breakpoint
ALTER TABLE "playground_test_results" DROP CONSTRAINT "playground_test_results_test_run_id_playground_test_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "playground_test_results" DROP CONSTRAINT "playground_test_results_completion_id_completions_id_fk";
--> statement-breakpoint
ALTER TABLE "playground_test_runs" DROP CONSTRAINT "playground_test_runs_test_case_id_playground_test_cases_id_fk";
--> statement-breakpoint
ALTER TABLE "playground_test_runs" DROP CONSTRAINT "playground_test_runs_api_key_id_api_keys_id_fk";
--> statement-breakpoint
ALTER TABLE "playground_conversations" ADD CONSTRAINT "playground_conversations_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_messages" ADD CONSTRAINT "playground_messages_conversation_id_playground_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."playground_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_messages" ADD CONSTRAINT "playground_messages_completion_id_completions_id_fk" FOREIGN KEY ("completion_id") REFERENCES "public"."completions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_test_results" ADD CONSTRAINT "playground_test_results_test_run_id_playground_test_runs_id_fk" FOREIGN KEY ("test_run_id") REFERENCES "public"."playground_test_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_test_results" ADD CONSTRAINT "playground_test_results_completion_id_completions_id_fk" FOREIGN KEY ("completion_id") REFERENCES "public"."completions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_test_runs" ADD CONSTRAINT "playground_test_runs_test_case_id_playground_test_cases_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "public"."playground_test_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_test_runs" ADD CONSTRAINT "playground_test_runs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;