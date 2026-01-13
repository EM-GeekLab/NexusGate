/**
 * OpenAI Response API response adapter
 * Converts internal format to OpenAI Response API format responses
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
// OpenAI Response API Types
// =============================================================================

interface ResponseApiResponse {
  id: string;
  object: "response";
  created_at: number;
  status: "completed" | "failed" | "incomplete" | "in_progress";
  status_details?: {
    type: string;
    reason?: string;
  };
  output: ResponseApiOutputItem[];
  usage?: ResponseApiUsage;
  model: string;
  metadata?: Record<string, string>;
}

interface ResponseApiOutputItem {
  type: "message" | "function_call" | "function_call_output";
  id?: string;
  role?: "assistant";
  content?: ResponseApiContentPart[];
  status?: "completed" | "in_progress";
  call_id?: string;
  name?: string;
  arguments?: string;
  output?: string;
}

interface ResponseApiContentPart {
  type: "output_text" | "refusal";
  text?: string;
  refusal?: string;
}

interface ResponseApiUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Convert internal stop reason to Response API status
 */
function convertStopReason(stopReason: StopReason): ResponseApiResponse["status"] {
  switch (stopReason) {
    case "end_turn":
    case "stop_sequence":
    case "tool_use":
      return "completed";
    case "max_tokens":
      return "incomplete";
    case "content_filter":
      return "failed";
    default:
      return "completed";
  }
}

/**
 * Convert internal content blocks to Response API output items
 */
function convertContentToOutput(content: InternalContentBlock[]): ResponseApiOutputItem[] {
  const output: ResponseApiOutputItem[] = [];
  const textParts: ResponseApiContentPart[] = [];
  const thinkingParts: string[] = [];

  for (const block of content) {
    if (block.type === "text") {
      textParts.push({
        type: "output_text",
        text: (block as TextContentBlock).text,
      });
    } else if (block.type === "thinking") {
      // Include thinking in text with markers
      thinkingParts.push((block as ThinkingContentBlock).thinking);
    } else if (block.type === "tool_use") {
      const toolBlock = block as ToolUseContentBlock;
      output.push({
        type: "function_call",
        id: toolBlock.id,
        call_id: toolBlock.id,
        name: toolBlock.name,
        arguments: JSON.stringify(toolBlock.input),
        status: "completed",
      });
    }
  }

  // Add thinking content before text if present
  if (thinkingParts.length > 0) {
    textParts.unshift({
      type: "output_text",
      text: `<think>${thinkingParts.join("")}</think>\n`,
    });
  }

  // Add message output if there's text content
  if (textParts.length > 0) {
    output.unshift({
      type: "message",
      id: `msg_${Date.now()}`,
      role: "assistant",
      content: textParts,
      status: "completed",
    });
  }

  return output;
}

// =============================================================================
// Response Adapter Implementation
// =============================================================================

export const openaiResponseResponseAdapter: ResponseAdapter<ResponseApiResponse> = {
  format: "openai-responses",

  serialize(response: InternalResponse): ResponseApiResponse {
    return {
      id: response.id,
      object: "response",
      created_at: response.createdAt || Math.floor(Date.now() / 1000),
      status: convertStopReason(response.stopReason),
      output: convertContentToOutput(response.content),
      usage: {
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
        total_tokens: response.usage.inputTokens + response.usage.outputTokens,
      },
      model: response.model,
    };
  },

  serializeStreamChunk(chunk: InternalStreamChunk): string {
    switch (chunk.type) {
      case "message_start": {
        const event = {
          type: "response.created",
          response: {
            id: chunk.message?.id || `resp_${Date.now()}`,
            object: "response",
            created_at: Math.floor(Date.now() / 1000),
            status: "in_progress",
            output: [],
            model: chunk.message?.model || "",
          },
        };
        return `data: ${JSON.stringify(event)}\n\n`;
      }

      case "content_block_start": {
        if (chunk.contentBlock?.type === "text") {
          const event = {
            type: "response.output_item.added",
            output_index: 0,
            item: {
              type: "message",
              id: `msg_${Date.now()}`,
              role: "assistant",
              content: [],
              status: "in_progress",
            },
          };
          return `data: ${JSON.stringify(event)}\n\n`;
        }
        if (chunk.contentBlock?.type === "tool_use") {
          const toolBlock = chunk.contentBlock as ToolUseContentBlock;
          const event = {
            type: "response.output_item.added",
            output_index: chunk.index || 0,
            item: {
              type: "function_call",
              id: toolBlock.id,
              call_id: toolBlock.id,
              name: toolBlock.name,
              arguments: "",
              status: "in_progress",
            },
          };
          return `data: ${JSON.stringify(event)}\n\n`;
        }
        return "";
      }

      case "content_block_delta": {
        if (chunk.delta?.type === "text_delta" && chunk.delta.text) {
          const event = {
            type: "response.output_text.delta",
            output_index: 0,
            content_index: chunk.index || 0,
            delta: chunk.delta.text,
          };
          return `data: ${JSON.stringify(event)}\n\n`;
        }
        if (chunk.delta?.type === "input_json_delta" && chunk.delta.partialJson) {
          const event = {
            type: "response.function_call_arguments.delta",
            output_index: chunk.index || 0,
            delta: chunk.delta.partialJson,
          };
          return `data: ${JSON.stringify(event)}\n\n`;
        }
        return "";
      }

      case "content_block_stop": {
        const event = {
          type: "response.output_item.done",
          output_index: chunk.index || 0,
        };
        return `data: ${JSON.stringify(event)}\n\n`;
      }

      case "message_delta": {
        // Send usage update if available
        if (chunk.usage) {
          const event = {
            type: "response.usage",
            usage: {
              input_tokens: chunk.usage.inputTokens,
              output_tokens: chunk.usage.outputTokens,
              total_tokens: chunk.usage.inputTokens + chunk.usage.outputTokens,
            },
          };
          return `data: ${JSON.stringify(event)}\n\n`;
        }
        return "";
      }

      case "message_stop": {
        const event = {
          type: "response.done",
          response: {
            status: "completed",
          },
        };
        return `data: ${JSON.stringify(event)}\n\n`;
      }

      case "error": {
        const event = {
          type: "error",
          error: {
            type: chunk.error?.type || "server_error",
            message: chunk.error?.message || "Unknown error",
          },
        };
        return `data: ${JSON.stringify(event)}\n\n`;
      }

      default:
        return "";
    }
  },

  getDoneMarker(): string {
    return "data: [DONE]\n\n";
  },
};
