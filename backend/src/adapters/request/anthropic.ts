/**
 * Anthropic Messages API request adapter
 * Converts Anthropic format requests to internal format
 */

import type {
  ImageContentBlock,
  InternalContentBlock,
  InternalMessage,
  InternalRequest,
  InternalToolDefinition,
  JsonSchema,
  RequestAdapter,
  TextContentBlock,
  ThinkingContentBlock,
  ToolResultContentBlock,
  ToolUseContentBlock,
} from "../types";

// =============================================================================
// Anthropic Request Types
// =============================================================================

interface AnthropicContentBlock {
  type: "text" | "image" | "tool_use" | "tool_result" | "thinking";
  text?: string;
  thinking?: string;
  source?: {
    type: "base64" | "url";
    media_type?: string;
    data?: string;
    url?: string;
  };
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | AnthropicContentBlock[];
  is_error?: boolean;
  cache_control?: { type: "ephemeral" };
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: JsonSchema;
  cache_control?: { type: "ephemeral" };
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string | AnthropicContentBlock[];
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stream?: boolean;
  stop_sequences?: string[];
  tools?: AnthropicTool[];
  tool_choice?: { type: "auto" | "any" | "tool"; name?: string };
  metadata?: { user_id?: string };
  [key: string]: unknown;
}

// =============================================================================
// Known Fields (for extracting extra body)
// =============================================================================

const KNOWN_FIELDS = new Set([
  "model",
  "messages",
  "system",
  "max_tokens",
  "temperature",
  "top_p",
  "top_k",
  "stream",
  "stop_sequences",
  "tools",
  "tool_choice",
  "metadata",
]);

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Convert Anthropic content block to internal format
 */
function convertContentBlock(
  block: AnthropicContentBlock,
): InternalContentBlock | null {
  switch (block.type) {
    case "text":
      return {
        type: "text",
        text: block.text || "",
        cacheControl: block.cache_control,
      } as TextContentBlock;

    case "thinking":
      return {
        type: "thinking",
        thinking: block.thinking || "",
      } as ThinkingContentBlock;

    case "tool_use":
      return {
        type: "tool_use",
        id: block.id || "",
        name: block.name || "",
        input: block.input || {},
      } as ToolUseContentBlock;

    case "tool_result": {
      let content = "";
      if (typeof block.content === "string") {
        content = block.content;
      } else if (Array.isArray(block.content)) {
        // Extract text from content blocks
        content = block.content
          .filter((b) => b.type === "text")
          .map((b) => b.text || "")
          .join("\n");
      }
      return {
        type: "tool_result",
        toolUseId: block.tool_use_id || "",
        content,
        isError: block.is_error,
      } as ToolResultContentBlock;
    }

    case "image":
      // Handle both base64 and URL source types
      if (block.source?.type === "url" && block.source.url) {
        return {
          type: "image",
          source: {
            type: "url",
            url: block.source.url,
          },
        } as ImageContentBlock;
      }
      // Handle base64 - only if type matches and data is present
      if (block.source?.type === "base64" && block.source.data) {
        return {
          type: "image",
          source: {
            type: "base64",
            mediaType: block.source.media_type,
            data: block.source.data,
          },
        } as ImageContentBlock;
      }
      // Skip images with missing data
      return null;

    default:
      return null;
  }
}

/**
 * Convert Anthropic message content to internal content blocks
 */
function convertContent(
  content: string | AnthropicContentBlock[],
): string | InternalContentBlock[] {
  if (typeof content === "string") {
    return content;
  }

  const blocks: InternalContentBlock[] = [];
  for (const block of content) {
    const converted = convertContentBlock(block);
    if (converted) {
      blocks.push(converted);
    }
  }

  const [firstBlock] = blocks;
  if (firstBlock && firstBlock.type === "text" && blocks.length === 1) {
    // Additional check for length, to ensure exactly one block
    return firstBlock.text;
  }

  return blocks;
}

/**
 * Convert Anthropic message to internal message
 */
function convertMessage(msg: AnthropicMessage): InternalMessage {
  const content = convertContent(msg.content);

  // Extract tool calls from assistant messages
  let toolCalls: ToolUseContentBlock[] | undefined;
  if (msg.role === "assistant" && Array.isArray(content)) {
    toolCalls = content.filter((b) => b.type === "tool_use");
    if (toolCalls.length === 0) {
      toolCalls = undefined;
    }
  }

  return {
    role: msg.role,
    content,
    toolCalls,
  };
}

/**
 * Convert Anthropic system prompt to string
 */
function convertSystemPrompt(
  system?: string | AnthropicContentBlock[],
): string | undefined {
  if (!system) {
    return undefined;
  }
  if (typeof system === "string") {
    return system;
  }
  // Extract text from system content blocks
  return system
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("\n");
}

/**
 * Convert Anthropic tools to internal tool definitions
 */
function convertTools(
  tools?: AnthropicTool[],
): InternalToolDefinition[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.input_schema,
  }));
}

/**
 * Convert Anthropic tool choice to internal format
 */
function convertToolChoice(
  toolChoice?: AnthropicRequest["tool_choice"],
): InternalRequest["toolChoice"] {
  if (!toolChoice) {
    return undefined;
  }
  if (toolChoice.type === "auto") {
    return "auto";
  }
  if (toolChoice.type === "any") {
    return "any";
  }
  if (toolChoice.type === "tool" && toolChoice.name) {
    return { type: "tool", name: toolChoice.name };
  }
  return "auto";
}

// =============================================================================
// Request Adapter Implementation
// =============================================================================

export const anthropicRequestAdapter: RequestAdapter<AnthropicRequest> = {
  format: "anthropic",

  parse(request: AnthropicRequest): InternalRequest {
    // Convert messages
    const messages: InternalMessage[] = [];

    for (const msg of request.messages) {
      // Handle tool result messages specially
      if (msg.role === "user" && Array.isArray(msg.content)) {
        const hasToolResult = msg.content.some((b) => b.type === "tool_result");
        if (hasToolResult) {
          // Split tool results into separate tool messages
          for (const block of msg.content) {
            if (block.type === "tool_result") {
              const converted = convertContentBlock(block);
              if (converted && converted.type === "tool_result") {
                messages.push({
                  role: "tool",
                  content: [converted],
                  toolCallId: converted.toolUseId,
                });
              }
            } else {
              // Add other blocks as user message
              const converted = convertContentBlock(block);
              if (converted) {
                messages.push({
                  role: "user",
                  content: [converted],
                });
              }
            }
          }
          continue;
        }
      }
      messages.push(convertMessage(msg));
    }

    return {
      model: request.model,
      messages,
      systemPrompt: convertSystemPrompt(request.system),
      maxTokens: request.max_tokens,
      temperature: request.temperature,
      topP: request.top_p,
      topK: request.top_k,
      stream: request.stream,
      tools: convertTools(request.tools),
      toolChoice: convertToolChoice(request.tool_choice),
      stopSequences: request.stop_sequences,
      extraParams: this.extractExtraBody?.(request as Record<string, unknown>),
    };
  },

  extractExtraBody(
    body: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const extra: Record<string, unknown> = {};
    let hasExtra = false;

    for (const [key, value] of Object.entries(body)) {
      if (!KNOWN_FIELDS.has(key)) {
        extra[key] = value;
        hasExtra = true;
      }
    }

    return hasExtra ? extra : undefined;
  },
};
