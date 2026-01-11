-- Add providers, models, and embeddings tables for new architecture
-- Migration: 0005_add_providers_models_embeddings

CREATE TYPE "public"."model_type" AS ENUM('chat', 'embedding');--> statement-breakpoint

CREATE TABLE "providers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "providers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(63) NOT NULL,
	"type" varchar(31) DEFAULT 'openai' NOT NULL,
	"base_url" varchar(255) NOT NULL,
	"api_key" varchar(255),
	"comment" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "providers_name_unique" UNIQUE("name")
);--> statement-breakpoint

CREATE TABLE "models" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "models_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"provider_id" integer NOT NULL,
	"system_name" varchar(63) NOT NULL,
	"remote_id" varchar(63),
	"model_type" "model_type" DEFAULT 'chat' NOT NULL,
	"context_length" integer,
	"input_price" real,
	"output_price" real,
	"weight" real DEFAULT 1 NOT NULL,
	"comment" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "models_provider_system_name_unique" UNIQUE("provider_id","system_name")
);--> statement-breakpoint

CREATE TABLE "embeddings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "embeddings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"api_key_id" integer NOT NULL,
	"model_id" integer,
	"model" varchar NOT NULL,
	"input" jsonb NOT NULL,
	"input_tokens" integer NOT NULL,
	"embedding" jsonb NOT NULL,
	"dimensions" integer NOT NULL,
	"status" "completions_status" DEFAULT 'pending' NOT NULL,
	"duration" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "embeddings_id_unique" UNIQUE("id")
);--> statement-breakpoint

ALTER TABLE "models" ADD CONSTRAINT "models_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;
