/**
 * Anthropic upstream adapter
 * Handles communication with Anthropic Claude API
 */

import { parseJsonResponse } from "@/utils/json";
import type {
  InternalContentBlock,
  InternalMessage,
  InternalRequest,
  InternalResponse,
  InternalStreamChunk,
  InternalToolDefinition,
  ProviderConfig,
  StopReason,
  TextContentBlock,
  ThinkingContentBlock,
  ToolUseContentBlock,
  UpstreamAdapter,
} from "../types";

// =============================================================================
// Anthropic Request/Response Types
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
  signature?: string;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
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
  [key: string]: unknown;
}

interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

// Stream event types
interface AnthropicStreamEvent {
  type: string;
  message?: AnthropicResponse;
  index?: number;
  content_block?: AnthropicContentBlock;
  delta?: {
    type: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
    stop_reason?: string;
    stop_sequence?: string | null;
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    type: string;
    message: string;
  };
}

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Convert internal message to Anthropic format
 */
function convertMessage(msg: InternalMessage): AnthropicMessage | null {
  // Skip system messages (handled separately)
  if (msg.role === "system") {
    return null;
  }

  // Handle tool messages -> convert to user message with tool_result
  if (msg.role === "tool") {
    const toolResults: AnthropicContentBlock[] = [];
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "tool_result") {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.toolUseId,
            content: block.content,
            is_error: block.isError,
          });
        }
      }
    } else {
      toolResults.push({
        type: "tool_result",
        tool_use_id: msg.toolCallId || "",
        content: msg.content,
      });
    }
    return {
      role: "user",
      content: toolResults,
    };
  }

  // Handle assistant messages
  if (msg.role === "assistant") {
    const content: AnthropicContentBlock[] = [];

    if (typeof msg.content === "string") {
      if (msg.content) {
        content.push({ type: "text", text: msg.content });
      }
    } else {
      for (const block of msg.content) {
        if (block.type === "text") {
          content.push({ type: "text", text: block.text });
        } else if (block.type === "thinking") {
          content.push({
            type: "thinking",
            thinking: block.thinking,
            signature: block.signature,
          });
        }
      }
    }

    // Add tool calls
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }
    }

    return {
      role: "assistant",
      content: content.length > 0 ? content : [{ type: "text", text: "" }],
    };
  }

  // Handle user messages
  if (typeof msg.content === "string") {
    return {
      role: "user",
      content: msg.content,
    };
  }

  // Convert content blocks
  const content: AnthropicContentBlock[] = [];
  for (const block of msg.content) {
    if (block.type === "text") {
      content.push({
        type: "text",
        text: block.text,
        cache_control: block.cacheControl,
      });
    } else if (block.type === "image") {
      // Only push image blocks with valid data
      if (block.source.type === "base64" && block.source.data) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: block.source.mediaType || "image/jpeg",
            data: block.source.data,
          },
        });
      } else if (block.source.type === "url" && block.source.url) {
        // Anthropic also supports URL source type
        content.push({
          type: "image",
          source: {
            type: "url",
            url: block.source.url,
          },
        });
      }
    }
  }

  return {
    role: "user",
    content: content.length > 0 ? content : "",
  };
}

/**
 * Convert internal tools to Anthropic format
 */
function convertTools(
  tools?: InternalToolDefinition[],
): AnthropicTool[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
    cache_control: tool.cacheControl,
  }));
}

/**
 * Convert internal tool choice to Anthropic format
 */
function convertToolChoice(
  toolChoice?: InternalRequest["toolChoice"],
): AnthropicRequest["tool_choice"] {
  if (!toolChoice) {
    return undefined;
  }
  if (toolChoice === "auto") {
    return { type: "auto" };
  }
  if (toolChoice === "any") {
    return { type: "any" };
  }
  if (toolChoice === "none") {
    return undefined; // Anthropic doesn't have explicit "none"
  }
  if (typeof toolChoice === "object" && toolChoice.type === "tool") {
    return { type: "tool", name: toolChoice.name };
  }
  return { type: "auto" };
}

/**
 * Convert Anthropic stop reason to internal format
 */
function convertStopReason(stopReason: string | null): StopReason {
  switch (stopReason) {
    case "end_turn":
      return "end_turn";
    case "max_tokens":
      return "max_tokens";
    case "stop_sequence":
      return "stop_sequence";
    case "tool_use":
      return "tool_use";
    case null:
    default:
      return null;
  }
}

/**
 * Convert Anthropic content block to internal format
 */
function convertContentBlock(
  block: AnthropicContentBlock,
): InternalContentBlock | null {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text || "" } as TextContentBlock;
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
    case "image":
    case "tool_result":
      // Image and tool_result blocks are not converted to internal format
      return null;
  }
}

/**
 * Convert Anthropic response to internal format
 */
function convertResponse(resp: AnthropicResponse): InternalResponse {
  const content: InternalContentBlock[] = [];

  for (const block of resp.content) {
    const converted = convertContentBlock(block);
    if (converted) {
      content.push(converted);
    }
  }

  return {
    id: resp.id,
    model: resp.model,
    content,
    stopReason: convertStopReason(resp.stop_reason),
    usage: {
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      cacheCreationInputTokens: resp.usage.cache_creation_input_tokens,
      cacheReadInputTokens: resp.usage.cache_read_input_tokens,
    },
  };
}

// =============================================================================
// SSE Parser for Anthropic
// =============================================================================

async function* parseAnthropicSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AnthropicStreamEvent, void, unknown> {
  const decoder = new TextDecoderStream();
  const reader = body.pipeThrough(decoder).getReader();
  let buffer = "";
  let currentEvent = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      // Handle both "event: " (standard) and "event:" (some providers like Alibaba DashScope)
      if (trimmed.startsWith("event:")) {
        currentEvent = trimmed.startsWith("event: ")
          ? trimmed.slice(7)
          : trimmed.slice(6);
      } else if (trimmed.startsWith("data:")) {
        // Handle both "data: " (standard) and "data:" (some providers like Alibaba DashScope)
        const data = trimmed.startsWith("data: ")
          ? trimmed.slice(6)
          : trimmed.slice(5);
        try {
          const event = JSON.parse(data) as AnthropicStreamEvent;
          event.type = currentEvent || event.type;
          yield event;
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

// =============================================================================
// Upstream Adapter Implementation
// =============================================================================

export const anthropicUpstreamAdapter: UpstreamAdapter = {
  providerType: "anthropic",

  buildRequest(
    request: InternalRequest,
    provider: ProviderConfig,
  ): { url: string; init: RequestInit } {
    // Build messages array
    const messages: AnthropicMessage[] = [];

    for (const msg of request.messages) {
      const converted = convertMessage(msg);
      if (converted) {
        // Merge consecutive same-role messages (Anthropic requirement)
        const last = messages[messages.length - 1];
        if (last && last.role === converted.role) {
          // Merge contents
          if (
            typeof last.content === "string" &&
            typeof converted.content === "string"
          ) {
            last.content = `${last.content}\n${converted.content}`;
          } else {
            const lastContent =
              typeof last.content === "string"
                ? [{ type: "text" as const, text: last.content }]
                : last.content;
            const newContent =
              typeof converted.content === "string"
                ? [{ type: "text" as const, text: converted.content }]
                : converted.content;
            last.content = [...lastContent, ...newContent];
          }
        } else {
          messages.push(converted);
        }
      }
    }

    // Build request body
    const body: AnthropicRequest = {
      model: request.model,
      messages,
      max_tokens: request.maxTokens || 4096, // Anthropic requires max_tokens
      ...(request.systemPrompt && { system: request.systemPrompt }),
      ...(request.temperature !== undefined && {
        temperature: request.temperature,
      }),
      ...(request.topP !== undefined && { top_p: request.topP }),
      ...(request.topK !== undefined && { top_k: request.topK }),
      ...(request.stream !== undefined && { stream: request.stream }),
      ...(request.stopSequences && { stop_sequences: request.stopSequences }),
      ...(request.tools && { tools: convertTools(request.tools) }),
      ...(request.toolChoice && {
        tool_choice: convertToolChoice(request.toolChoice),
      }),
      ...request.extraParams,
    };

    // Build URL — strip trailing slash and /v1 suffix to normalize,
    // then always append /v1/messages. This handles both
    // "https://api.anthropic.com" and "https://api.anthropic.com/v1".
    let baseUrl = provider.baseUrl.replace(/\/+$/, "");
    if (baseUrl.endsWith("/v1")) {
      baseUrl = baseUrl.slice(0, -3);
    }
    const url = `${baseUrl}/v1/messages`;

    // Build headers (Anthropic uses x-api-key instead of Authorization Bearer)
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": provider.apiVersion || "2023-06-01",
    };
    if (provider.apiKey) {
      headers["x-api-key"] = provider.apiKey;
    }
    if (request.extraHeaders) {
      Object.assign(headers, request.extraHeaders);
    }

    return {
      url,
      init: {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
    };
  },

  async parseResponse(response: Response): Promise<InternalResponse> {
    const text = await response.text();
    const json = parseJsonResponse<AnthropicResponse>(text, "Anthropic");
    return convertResponse(json);
  },

  async *parseStreamResponse(
    response: Response,
  ): AsyncGenerator<InternalStreamChunk, void, unknown> {
    if (!response.body) {
      throw new Error("Response body is null");
    }

    const events = parseAnthropicSse(response.body);

    for await (const event of events) {
      switch (event.type) {
        case "message_start": {
          const msg = event.message;
          yield {
            type: "message_start",
            message: msg
              ? {
                  id: msg.id,
                  model: msg.model,
                  content: [],
                  stopReason: null,
                  usage: {
                    inputTokens: msg.usage?.input_tokens || 0,
                    outputTokens: 0,
                  },
                }
              : undefined,
            usage: event.usage
              ? {
                  inputTokens: event.usage.input_tokens || 0,
                  outputTokens: event.usage.output_tokens || 0,
                }
              : undefined,
          };
          break;
        }

        case "content_block_start": {
          const block = event.content_block;
          let contentBlock: InternalContentBlock | undefined;
          if (block?.type === "text") {
            contentBlock = { type: "text", text: "" };
          } else if (block?.type === "thinking") {
            contentBlock = { type: "thinking", thinking: "" };
          } else if (block?.type === "tool_use") {
            contentBlock = {
              type: "tool_use",
              id: block.id || "",
              name: block.name || "",
              input: {},
            };
          }
          yield {
            type: "content_block_start",
            index: event.index,
            contentBlock,
          };
          break;
        }

        case "content_block_delta": {
          const delta = event.delta;
          if (delta?.type === "text_delta") {
            yield {
              type: "content_block_delta",
              index: event.index,
              delta: { type: "text_delta", text: delta.text },
            };
          } else if (delta?.type === "thinking_delta") {
            yield {
              type: "content_block_delta",
              index: event.index,
              delta: { type: "thinking_delta", thinking: delta.thinking },
            };
          } else if (delta?.type === "input_json_delta") {
            yield {
              type: "content_block_delta",
              index: event.index,
              delta: {
                type: "input_json_delta",
                partialJson: delta.partial_json,
              },
            };
          }
          break;
        }

        case "content_block_stop": {
          yield {
            type: "content_block_stop",
            index: event.index,
          };
          break;
        }

        case "message_delta": {
          yield {
            type: "message_delta",
            messageDelta: {
              stopReason: convertStopReason(event.delta?.stop_reason || null),
              stopSequence: event.delta?.stop_sequence,
            },
            usage: event.usage
              ? {
                  inputTokens: event.usage.input_tokens || 0,
                  outputTokens: event.usage.output_tokens || 0,
                }
              : undefined,
          };
          break;
        }

        case "message_stop": {
          yield { type: "message_stop" };
          break;
        }

        case "error": {
          yield {
            type: "error",
            error: {
              type: event.error?.type || "api_error",
              message: event.error?.message || "Unknown error",
            },
          };
          break;
        }
      }
    }
  },
};
