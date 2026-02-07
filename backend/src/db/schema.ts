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

// ============================================
// Alert System Types
// ============================================

export type WebhookChannelConfig = {
  url: string;
  headers?: Record<string, string>;
  secret?: string;
};
export type EmailChannelConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  to: string[];
};
export type FeishuChannelConfig = {
  webhookUrl: string;
  secret?: string;
};
export type AlertChannelConfig =
  | WebhookChannelConfig
  | EmailChannelConfig
  | FeishuChannelConfig;

export type BudgetCondition = {
  thresholdUsd: number;
  periodDays: number;
  apiKeyId?: number;
};
export type ErrorRateCondition = {
  thresholdPercent: number;
  windowMinutes: number;
  model?: string;
};
export type LatencyCondition = {
  thresholdMs: number;
  percentile: number;
  windowMinutes: number;
  model?: string;
};
export type QuotaCondition = {
  thresholdPercent: number;
  apiKeyId?: number;
  limitType: "rpm" | "tpm" | "both";
};
export type AlertCondition =
  | BudgetCondition
  | ErrorRateCondition
  | LatencyCondition
  | QuotaCondition;

export type AlertPayload = {
  ruleType: string;
  ruleName: string;
  message: string;
  currentValue: number;
  threshold: number;
  details?: Record<string, unknown>;
};

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
export type CompletionsStatusEnumType =
  | "pending"
  | "completed"
  | "failed"
  | "aborted"
  | "cache_hit";

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
  // HTTP proxy configuration
  proxyUrl: varchar("proxy_url", { length: 255 }),
  proxyEnabled: boolean("proxy_enabled").notNull().default(false),
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

// ============================================
// Alert System Tables
// ============================================

export const AlertChannelTypeEnum = pgEnum("alert_channel_type", [
  "webhook",
  "email",
  "feishu",
]);
export type AlertChannelTypeEnumType =
  (typeof AlertChannelTypeEnum.enumValues)[number];

export const AlertRuleTypeEnum = pgEnum("alert_rule_type", [
  "budget",
  "error_rate",
  "latency",
  "quota",
]);
export type AlertRuleTypeEnumType =
  (typeof AlertRuleTypeEnum.enumValues)[number];

export const AlertHistoryStatusEnum = pgEnum("alert_history_status", [
  "sent",
  "failed",
  "suppressed",
]);
export type AlertHistoryStatusEnumType =
  (typeof AlertHistoryStatusEnum.enumValues)[number];

export const AlertChannelsTable = pgTable("alert_channels", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull(),
  type: AlertChannelTypeEnum("type").notNull(),
  config: jsonb("config").notNull().$type<AlertChannelConfig>(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  grafanaUid: varchar("grafana_uid", { length: 127 }),
  grafanaSyncedAt: timestamp("grafana_synced_at"),
  grafanaSyncError: varchar("grafana_sync_error", { length: 500 }),
});

export const AlertRulesTable = pgTable("alert_rules", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull(),
  type: AlertRuleTypeEnum("type").notNull(),
  condition: jsonb("condition").notNull().$type<AlertCondition>(),
  channelIds: integer("channel_ids").array().notNull(),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(60),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  grafanaUid: varchar("grafana_uid", { length: 127 }),
  grafanaSyncedAt: timestamp("grafana_synced_at"),
  grafanaSyncError: varchar("grafana_sync_error", { length: 500 }),
});

export const AlertHistoryTable = pgTable("alert_history", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ruleId: integer("rule_id")
    .notNull()
    .references((): AnyPgColumn => AlertRulesTable.id, { onDelete: "cascade" }),
  triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  payload: jsonb("payload").notNull().$type<AlertPayload>(),
  status: AlertHistoryStatusEnum("status").notNull(),
});

// ============================================
// Playground Tables
// ============================================

/**
 * Playground model parameters (shared JSONB type for conversations and test cases)
 */
export type PlaygroundParamsType = {
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stopSequences?: string[];
  frequencyPenalty?: number;
  presencePenalty?: number;
};

export const PlaygroundMessageRoleEnum = pgEnum("playground_message_role", [
  "system",
  "user",
  "assistant",
]);

export const PlaygroundTestResultStatusEnum = pgEnum(
  "playground_test_result_status",
  ["pending", "running", "completed", "failed"],
);

export const PlaygroundConversationsTable = pgTable(
  "playground_conversations",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    title: varchar("title", { length: 255 }).notNull(),
    model: varchar("model", { length: 63 }).notNull(),
    apiKeyId: integer("api_key_id").references(
      (): AnyPgColumn => ApiKeysTable.id,
    ),
    params: jsonb("params").$type<PlaygroundParamsType>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deleted: boolean("deleted").notNull().default(false),
  },
);

export const PlaygroundMessagesTable = pgTable("playground_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  conversationId: integer("conversation_id")
    .notNull()
    .references((): AnyPgColumn => PlaygroundConversationsTable.id),
  role: PlaygroundMessageRoleEnum("role").notNull(),
  content: varchar("content").notNull(),
  completionId: integer("completion_id").references(
    (): AnyPgColumn => CompletionsTable.id,
  ),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const PlaygroundTestCasesTable = pgTable("playground_test_cases", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: varchar("title", { length: 255 }).notNull(),
  description: varchar("description"),
  messages: jsonb("messages")
    .notNull()
    .$type<{ role: string; content: string }[]>(),
  params: jsonb("params").$type<PlaygroundParamsType>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deleted: boolean("deleted").notNull().default(false),
});

export const PlaygroundTestRunsTable = pgTable("playground_test_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  testCaseId: integer("test_case_id")
    .notNull()
    .references((): AnyPgColumn => PlaygroundTestCasesTable.id),
  apiKeyId: integer("api_key_id").references(
    (): AnyPgColumn => ApiKeysTable.id,
  ),
  models: jsonb("models").notNull().$type<string[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deleted: boolean("deleted").notNull().default(false),
});

export const PlaygroundTestResultsTable = pgTable("playground_test_results", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  testRunId: integer("test_run_id")
    .notNull()
    .references((): AnyPgColumn => PlaygroundTestRunsTable.id),
  model: varchar("model", { length: 63 }).notNull(),
  status: PlaygroundTestResultStatusEnum("status").notNull().default("pending"),
  response: varchar("response"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  ttft: integer("ttft"),
  duration: integer("duration"),
  errorMessage: varchar("error_message"),
  completionId: integer("completion_id").references(
    (): AnyPgColumn => CompletionsTable.id,
  ),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
