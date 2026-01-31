/**
 * Internal unified format types for multi-API format support
 * These types serve as the intermediate representation between different API formats
 */

// =============================================================================
// Content Block Types
// =============================================================================

/**
 * Text content block
 */
export interface TextContentBlock {
  type: "text";
  text: string;
  /** Anthropic cache control for prompt caching */
  cacheControl?: { type: "ephemeral" };
}

/**
 * Thinking/reasoning content block (for extended thinking / reasoning models)
 */
export interface ThinkingContentBlock {
  type: "thinking";
  thinking: string;
  /** Signature for thinking blocks (required when replaying in multi-turn) */
  signature?: string;
}

/**
 * Tool use content block - represents a tool call from the assistant
 */
export interface ToolUseContentBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool result content block - represents the result of a tool call
 */
export interface ToolResultContentBlock {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

/**
 * Image source types - discriminated union for type safety
 */
export type ImageSource =
  | {
      type: "base64";
      mediaType?: string; // "image/jpeg", "image/png", etc.
      data: string;
    }
  | {
      type: "url";
      url: string;
    };

/**
 * Image content block - represents an image input for vision models
 */
export interface ImageContentBlock {
  type: "image";
  source: ImageSource;
  detail?: "auto" | "low" | "high"; // OpenAI vision detail level
}

/**
 * Union type for all content blocks
 */
export type InternalContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock
  | ImageContentBlock;

// =============================================================================
// Message Types
// =============================================================================

/**
 * Internal unified message format
 */
export interface InternalMessage {
  role: "system" | "user" | "assistant" | "tool";
  /** Content can be a simple string or array of content blocks */
  content: string | InternalContentBlock[];
  /** Tool call ID (for tool role messages) */
  toolCallId?: string;
  /** Tool calls made by assistant */
  toolCalls?: ToolUseContentBlock[];
  /** Anthropic cache control */
  cacheControl?: { type: "ephemeral" };
}

// =============================================================================
// Tool Definition Types
// =============================================================================

/**
 * JSON Schema type for tool parameters
 */
export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  description?: string;
  enum?: unknown[];
  [key: string]: unknown;
}

/**
 * Internal tool definition format
 */
export interface InternalToolDefinition {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
  /** Anthropic cache control for prompt caching */
  cacheControl?: { type: "ephemeral" };
}

// =============================================================================
// Request Types
// =============================================================================

/**
 * Internal unified request format
 */
export interface InternalRequest {
  /** Model identifier (can be system name or system_name@provider format) */
  model: string;
  /** Conversation messages */
  messages: InternalMessage[];
  /** System prompt (separate from messages for Anthropic compatibility) */
  systemPrompt?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for sampling */
  temperature?: number;
  /** Top-p (nucleus) sampling */
  topP?: number;
  /** Top-k sampling */
  topK?: number;
  /** Whether to stream the response */
  stream?: boolean;
  /** Tool definitions */
  tools?: InternalToolDefinition[];
  /** Tool choice configuration */
  toolChoice?: "auto" | "any" | "none" | { type: "tool"; name: string };
  /** Stop sequences */
  stopSequences?: string[];
  /** Extra parameters to pass through (provider-specific) */
  extraParams?: Record<string, unknown>;
  /** Extra headers to pass through */
  extraHeaders?: Record<string, string>;
}

// =============================================================================
// Response Types
// =============================================================================

/**
 * Stop reason enum
 */
export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "tool_use"
  | "content_filter"
  | null;

/**
 * Usage statistics
 */
export interface InternalUsage {
  inputTokens: number;
  outputTokens: number;
  /** Anthropic prompt caching stats */
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

/**
 * Internal unified response format
 */
export interface InternalResponse {
  /** Response ID */
  id: string;
  /** Model that generated the response */
  model: string;
  /** Content blocks in the response */
  content: InternalContentBlock[];
  /** Why the response stopped */
  stopReason: StopReason;
  /** Token usage statistics */
  usage: InternalUsage;
  /** Response creation timestamp */
  createdAt?: number;
}

// =============================================================================
// Stream Chunk Types
// =============================================================================

/**
 * Stream event types
 */
export type StreamEventType =
  | "message_start"
  | "content_block_start"
  | "content_block_delta"
  | "content_block_stop"
  | "message_delta"
  | "message_stop"
  | "error";

/**
 * Internal stream chunk format
 */
export interface InternalStreamChunk {
  type: StreamEventType;
  /** Index of the content block (for multi-block responses) */
  index?: number;
  /** Content block being started */
  contentBlock?: InternalContentBlock;
  /** Delta content (for content_block_delta) */
  delta?: {
    type: "text_delta" | "thinking_delta" | "signature_delta" | "input_json_delta";
    text?: string;
    thinking?: string;
    signature?: string;
    partialJson?: string;
  };
  /** Message delta (for message_delta) */
  messageDelta?: {
    stopReason?: StopReason;
    stopSequence?: string | null;
  };
  /** Usage info (typically in message_delta or final chunk) */
  usage?: InternalUsage;
  /** Error info (for error events) */
  error?: {
    type: string;
    message: string;
  };
  /** Partial response info (for message_start) */
  message?: Partial<InternalResponse>;
}

// =============================================================================
// Adapter Interfaces
// =============================================================================

/**
 * Request adapter interface - converts external format to internal format
 */
export interface RequestAdapter<T = unknown> {
  /** Format identifier */
  format: string;
  /** Parse external request to internal format */
  parse(request: T): InternalRequest;
  /** Extract extra body fields that should be passed through */
  extractExtraBody?(
    body: Record<string, unknown>,
  ): Record<string, unknown> | undefined;
}

/**
 * Response adapter interface - converts internal format to external format
 */
export interface ResponseAdapter<T = unknown> {
  /** Format identifier */
  format: string;
  /** Serialize internal response to external format */
  serialize(response: InternalResponse): T;
  /** Serialize stream chunk to external format (returns string for SSE) */
  serializeStreamChunk(chunk: InternalStreamChunk): string;
  /** Get the done marker for this format's SSE stream */
  getDoneMarker(): string;
}

/**
 * Upstream adapter interface - handles communication with upstream providers
 */
export interface UpstreamAdapter {
  /** Provider type identifier */
  providerType: string;
  /** Build upstream request from internal format */
  buildRequest(
    request: InternalRequest,
    provider: ProviderConfig,
  ): {
    url: string;
    init: RequestInit;
  };
  /** Parse upstream response to internal format */
  parseResponse(response: Response): Promise<InternalResponse>;
  /** Parse upstream stream response, yielding internal stream chunks */
  parseStreamResponse(
    response: Response,
  ): AsyncGenerator<InternalStreamChunk, void, unknown>;
  /** Build error response in internal format */
  buildErrorResponse?(error: unknown, statusCode: number): InternalResponse;
}

/**
 * Provider configuration (from database)
 */
export interface ProviderConfig {
  id: number;
  name: string;
  type: string;
  baseUrl: string;
  apiKey: string | null;
  apiVersion?: string | null;
}

/**
 * Model configuration (from database)
 */
export interface ModelConfig {
  id: number;
  providerId: number;
  systemName: string;
  remoteId: string | null;
  modelType: "chat" | "embedding";
  weight: number;
}

/**
 * Combined model with provider info
 */
export interface ModelWithProvider {
  model: ModelConfig;
  provider: ProviderConfig;
}

// =============================================================================
// API Format Identifiers
// =============================================================================

/**
 * Supported request/response formats
 */
export type ApiFormat = "openai-chat" | "openai-responses" | "anthropic";

/**
 * Supported provider types
 */
export type ProviderType =
  | "openai"
  | "openai-responses"
  | "anthropic"
  | "azure"
  | "ollama";
