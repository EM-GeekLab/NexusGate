/**
 * Anthropic Messages API response adapter
 * Converts internal format to Anthropic format responses
 */

import type {
  InternalContentBlock,
  InternalResponse,
  InternalStreamChunk,
  ResponseAdapter,
  StopReason,
  TextContentBlock,
  ThinkingContentBlock,
  ToolUseContentBlock,
} from "../types";

// =============================================================================
// Anthropic Response Types
// =============================================================================

interface AnthropicMessage {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "thinking";
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Convert internal stop reason to Anthropic stop reason
 */
function convertStopReason(stopReason: StopReason): string | null {
  switch (stopReason) {
    case "end_turn":
      return "end_turn";
    case "max_tokens":
      return "max_tokens";
    case "stop_sequence":
      return "stop_sequence";
    case "tool_use":
      return "tool_use";
    case "content_filter":
      return "content_filter";
    default:
      return null;
  }
}

/**
 * Convert internal content block to Anthropic format
 */
function convertContentBlock(block: InternalContentBlock): AnthropicContentBlock | null {
  switch (block.type) {
    case "text":
      return {
        type: "text",
        text: (block as TextContentBlock).text,
      };
    case "thinking":
      return {
        type: "thinking",
        thinking: (block as ThinkingContentBlock).thinking,
      };
    case "tool_use": {
      const toolBlock = block as ToolUseContentBlock;
      return {
        type: "tool_use",
        id: toolBlock.id,
        name: toolBlock.name,
        input: toolBlock.input,
      };
    }
    default:
      return null;
  }
}

// =============================================================================
// Response Adapter Implementation
// =============================================================================

export const anthropicResponseAdapter: ResponseAdapter<AnthropicMessage> = {
  format: "anthropic",

  serialize(response: InternalResponse): AnthropicMessage {
    const content: AnthropicContentBlock[] = [];

    for (const block of response.content) {
      const converted = convertContentBlock(block);
      if (converted) {
        content.push(converted);
      }
    }

    return {
      id: response.id,
      type: "message",
      role: "assistant",
      content,
      model: response.model,
      stop_reason: convertStopReason(response.stopReason),
      stop_sequence: null,
      usage: {
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
        cache_creation_input_tokens: response.usage.cacheCreationInputTokens,
        cache_read_input_tokens: response.usage.cacheReadInputTokens,
      },
    };
  },

  serializeStreamChunk(chunk: InternalStreamChunk): string {
    switch (chunk.type) {
      case "message_start": {
        const message: Partial<AnthropicMessage> = {
          id: chunk.message?.id || `msg_${Date.now()}`,
          type: "message",
          role: "assistant",
          content: [],
          model: chunk.message?.model || "",
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: chunk.usage?.inputTokens || 0,
            output_tokens: 0,
          },
        };
        const event = {
          type: "message_start",
          message,
        };
        return `event: message_start\ndata: ${JSON.stringify(event)}\n\n`;
      }

      case "content_block_start": {
        let contentBlock: AnthropicContentBlock;
        if (chunk.contentBlock?.type === "text") {
          contentBlock = { type: "text", text: "" };
        } else if (chunk.contentBlock?.type === "thinking") {
          contentBlock = { type: "thinking", thinking: "" };
        } else if (chunk.contentBlock?.type === "tool_use") {
          const toolBlock = chunk.contentBlock as ToolUseContentBlock;
          contentBlock = {
            type: "tool_use",
            id: toolBlock.id,
            name: toolBlock.name,
            input: {},
          };
        } else {
          contentBlock = { type: "text", text: "" };
        }
        const event = {
          type: "content_block_start",
          index: chunk.index || 0,
          content_block: contentBlock,
        };
        return `event: content_block_start\ndata: ${JSON.stringify(event)}\n\n`;
      }

      case "content_block_delta": {
        let delta: Record<string, unknown>;
        if (chunk.delta?.type === "text_delta") {
          delta = { type: "text_delta", text: chunk.delta.text || "" };
        } else if (chunk.delta?.type === "thinking_delta") {
          delta = { type: "thinking_delta", thinking: chunk.delta.thinking || "" };
        } else if (chunk.delta?.type === "input_json_delta") {
          delta = { type: "input_json_delta", partial_json: chunk.delta.partialJson || "" };
        } else {
          return "";
        }
        const event = {
          type: "content_block_delta",
          index: chunk.index || 0,
          delta,
        };
        return `event: content_block_delta\ndata: ${JSON.stringify(event)}\n\n`;
      }

      case "content_block_stop": {
        const event = {
          type: "content_block_stop",
          index: chunk.index || 0,
        };
        return `event: content_block_stop\ndata: ${JSON.stringify(event)}\n\n`;
      }

      case "message_delta": {
        const event = {
          type: "message_delta",
          delta: {
            stop_reason: convertStopReason(chunk.messageDelta?.stopReason || null),
            stop_sequence: chunk.messageDelta?.stopSequence || null,
          },
          usage: chunk.usage
            ? {
                output_tokens: chunk.usage.outputTokens,
              }
            : undefined,
        };
        return `event: message_delta\ndata: ${JSON.stringify(event)}\n\n`;
      }

      case "message_stop": {
        const event = { type: "message_stop" };
        return `event: message_stop\ndata: ${JSON.stringify(event)}\n\n`;
      }

      case "error": {
        const event = {
          type: "error",
          error: {
            type: chunk.error?.type || "api_error",
            message: chunk.error?.message || "Unknown error",
          },
        };
        return `event: error\ndata: ${JSON.stringify(event)}\n\n`;
      }

      default:
        return "";
    }
  },

  getDoneMarker(): string {
    // Anthropic uses message_stop event instead of a done marker
    return "";
  },
};
