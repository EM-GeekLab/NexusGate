import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  timestamp,
  unique,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/**
 * API Key source enum - tracks how the key was created
 */
export const ApiKeySourceEnum = pgEnum("api_key_source", [
  "manual", // Created manually via UI or API
  "operator", // Created by K8s Operator
  "init", // Created from init config
]);
export type ApiKeySourceEnumType = (typeof ApiKeySourceEnum.enumValues)[number];

export const ApiKeysTable = pgTable("api_keys", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: varchar("key", {
    length: 63,
  })
    .notNull()
    .unique(),
  comment: varchar("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  lastSeen: timestamp("last_seen"),
  revoked: boolean("revoked").notNull().default(false),
  // Rate limit configuration
  rpmLimit: integer("rpm_limit").notNull().default(50), // Requests per minute
  tpmLimit: integer("tpm_limit").notNull().default(50000), // Tokens per minute
  // External system integration (for K8s Operator)
  externalId: varchar("external_id", { length: 127 }).unique(), // e.g., k8s/cluster/namespace/appName
  source: ApiKeySourceEnum("source").default("manual"), // How the key was created
});

export const UpstreamTable = pgTable("upstreams", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  // upstream name
  name: varchar("name", {
    length: 63,
  }).notNull(),
  // upstream url
  url: varchar("url", {
    length: 255,
  }).notNull(),
  // model name, used for incoming requests
  model: varchar("model", {
    length: 63,
  }).notNull(),
  // model name in upstream
  upstreamModel: varchar("upstream_model", {
    length: 63,
  }),
  // api key for upstream
  apiKey: varchar("api_key", {
    length: 255,
  }),
  // weight for load balancing
  weight: real("weight").notNull().default(1),
  comment: varchar("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deleted: boolean("deleted").notNull().default(false),
});

/**
 * Tool call in assistant message (OpenAI format)
 */
export type ToolCallType = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

/**
 * Tool definition (OpenAI format)
 */
export type ToolDefinitionType = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

/**
 * Tool choice configuration (OpenAI format)
 */
export type ToolChoiceType =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } };

/**
 * Message content part (for multi-part messages)
 */
export type MessageContentPartType =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: string } };

/**
 * Completion message type - supports full OpenAI message format
 */
export type CompletionsMessageType = {
  role: string;
  content?: string | MessageContentPartType[] | null;
  // For assistant messages with tool calls
  tool_calls?: ToolCallType[];
  // For tool messages (results)
  tool_call_id?: string;
  // For function messages (legacy)
  name?: string;
};

export type CompletionsPromptType = {
  messages: CompletionsMessageType[];
  n?: number;
  // Tool definitions passed in the request
  tools?: ToolDefinitionType[];
  // Tool choice configuration
  tool_choice?: ToolChoiceType;
  // Extra body fields passed through to upstream
  extraBody?: Record<string, unknown>;
  // Extra headers passed through to upstream
  extraHeaders?: Record<string, string>;
};

export type CompletionsCompletionType = {
  role?: string; // null in stream api
  content?: string | null;
  // Tool calls made by the assistant
  tool_calls?: ToolCallType[];
}[];

export const CompletionsStatusEnum = pgEnum("completions_status", [
  "pending",
  "completed",
  "failed",
  "aborted",
  "cache_hit",
]);
export type CompletionsStatusEnumType = "pending" | "completed" | "failed" | "aborted" | "cache_hit";

/**
 * Cached response type for ReqId deduplication
 * Stores the serialized response for cache_hit returns
 */
export type CachedResponseType = {
  body: unknown;
  format: "openai-chat" | "openai-responses" | "anthropic";
};

export const CompletionsTable = pgTable("completions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity().unique(),
  apiKeyId: integer("api_key_id")
    .notNull()
    .references((): AnyPgColumn => ApiKeysTable.id),
  upstreamId: integer("upstream_id").references(
    (): AnyPgColumn => UpstreamTable.id,
  ),
  // Reference to the new ModelsTable (for new architecture)
  modelId: integer("model_id"),
  model: varchar("model").notNull(),
  prompt: jsonb("prompt").notNull().$type<CompletionsPromptType>(),
  promptTokens: integer("prompt_tokens").notNull(),
  completion: jsonb("completion").notNull().$type<CompletionsCompletionType>(),
  completionTokens: integer("completion_tokens").notNull(),
  status: CompletionsStatusEnum().notNull().default("pending"),
  ttft: integer("ttft").notNull(),
  duration: integer("duration").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deleted: boolean("deleted").notNull().default(false),
  rating: real("rating"),
  // ReqId deduplication fields
  reqId: varchar("req_id", { length: 127 }),
  sourceCompletionId: integer("source_completion_id").references(
    (): AnyPgColumn => CompletionsTable.id,
  ),
  apiFormat: varchar("api_format", { length: 31 }),
  cachedResponse: jsonb("cached_response").$type<CachedResponseType>(),
});

export const SrvLogsLevelEnum = pgEnum("srv_logs_level", [
  "unspecific",
  "info",
  "warn",
  "error",
]);
export type SrvLogsLevelEnumType = (typeof SrvLogsLevelEnum.enumValues)[number];
export type SrvLogDetailsType = {
  type: string;
  data: unknown;
};

export const SrvLogsTable = pgTable("srv_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity().unique(),
  relatedApiKeyId: integer("related_api_key_id").references(
    (): AnyPgColumn => ApiKeysTable.id,
  ),
  relatedUpstreamId: integer("related_upstream_id").references(
    (): AnyPgColumn => UpstreamTable.id,
  ),
  relatedCompletionId: integer("related_completion_id").references(
    (): AnyPgColumn => CompletionsTable.id,
  ),
  message: varchar("message").notNull(),
  level: SrvLogsLevelEnum("level").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  acknowledged: boolean("acknowledged").notNull().default(false),
  ackAt: timestamp("ack_at"),
});

export const SettingsTable = pgTable("settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: varchar("key", {
    length: 63,
  })
    .notNull()
    .unique(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================
// Provider + Model Architecture (New)
// ============================================

/**
 * Provider type enum - defines supported API formats for upstream providers
 */
export const ProviderTypeEnum = pgEnum("provider_type", [
  "openai", // OpenAI Chat Completion API
  "openai-responses", // OpenAI Response API (new agent format)
  "anthropic", // Anthropic Messages API
  "azure", // Azure OpenAI (uses OpenAI format)
  "ollama", // Ollama (uses OpenAI format)
]);
export type ProviderTypeEnumType = (typeof ProviderTypeEnum.enumValues)[number];

/**
 * Providers table - represents an LLM service provider (e.g., OpenAI, Azure, local vLLM)
 */
export const ProvidersTable = pgTable("providers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 63 }).notNull(),
  // Provider type determines which upstream adapter to use
  type: ProviderTypeEnum("type").notNull().default("openai"),
  baseUrl: varchar("base_url", { length: 255 }).notNull(),
  apiKey: varchar("api_key", { length: 255 }),
  // API version header (required for Anthropic: anthropic-version)
  apiVersion: varchar("api_version", { length: 31 }),
  comment: varchar("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deleted: boolean("deleted").notNull().default(false),
});

/**
 * Model type enum - distinguishes between chat and embedding models
 */
export const ModelTypeEnum = pgEnum("model_type", ["chat", "embedding"]);
export type ModelTypeEnumType = "chat" | "embedding";

/**
 * Models table - represents a model configuration under a provider
 */
export const ModelsTable = pgTable(
  "models",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    providerId: integer("provider_id")
      .notNull()
      .references((): AnyPgColumn => ProvidersTable.id),
    // System name - the name used in API requests
    systemName: varchar("system_name", { length: 63 }).notNull(),
    // Remote ID - the actual model ID in upstream (optional, defaults to systemName)
    remoteId: varchar("remote_id", { length: 63 }),
    // Model type
    modelType: ModelTypeEnum("model_type").notNull().default("chat"),
    // Context length (optional)
    contextLength: integer("context_length"),
    // Pricing (optional) - price per 1M tokens in USD
    inputPrice: real("input_price"),
    outputPrice: real("output_price"),
    // Load balancing weight
    weight: real("weight").notNull().default(1),
    comment: varchar("comment"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deleted: boolean("deleted").notNull().default(false),
  },
  (table) => [
    // Same system name can only appear once per provider
    unique("models_provider_system_name_unique").on(
      table.providerId,
      table.systemName,
    ),
  ],
);

/**
 * Embeddings input type - can be a string or array of strings
 */
export type EmbeddingsInputType = string | string[];

/**
 * Embeddings table - logs embedding API requests
 */
export const EmbeddingsTable = pgTable("embeddings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity().unique(),
  apiKeyId: integer("api_key_id")
    .notNull()
    .references((): AnyPgColumn => ApiKeysTable.id),
  modelId: integer("model_id").references((): AnyPgColumn => ModelsTable.id),
  // Requested model name
  model: varchar("model").notNull(),
  // Input text(s)
  input: jsonb("input").notNull().$type<EmbeddingsInputType>(),
  // Token usage
  inputTokens: integer("input_tokens").notNull(),
  // Embedding vectors (array of arrays for batch requests)
  embedding: jsonb("embedding").notNull().$type<number[][]>(),
  // Vector dimensions
  dimensions: integer("dimensions").notNull(),
  // Request status
  status: CompletionsStatusEnum().notNull().default("pending"),
  // Request duration in milliseconds
  duration: integer("duration").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deleted: boolean("deleted").notNull().default(false),
});
