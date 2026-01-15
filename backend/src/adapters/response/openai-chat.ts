/**
 * OpenAI Chat Completion API response adapter
 * Converts internal format to OpenAI Chat format responses
 */

import type {
  InternalContentBlock,
  InternalResponse,
  InternalStreamChunk,
  ResponseAdapter,
  StopReason,
} from "../types";

// =============================================================================
// OpenAI Chat Response Types
// =============================================================================

interface OpenAIChatCompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: OpenAIChatChoice[];
  usage?: OpenAIUsage;
  system_fingerprint?: string;
}

interface OpenAIChatChoice {
  index: number;
  message: OpenAIChatMessage;
  finish_reason: string | null;
  logprobs?: null;
}

interface OpenAIChatMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  refusal?: string | null;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: OpenAIChatChunkChoice[];
  usage?: OpenAIUsage | null;
  system_fingerprint?: string;
}

interface OpenAIChatChunkChoice {
  index: number;
  delta: OpenAIChatDelta;
  finish_reason: string | null;
  logprobs?: null;
}

interface OpenAIChatDelta {
  role?: "assistant";
  content?: string | null;
  tool_calls?: OpenAIToolCallDelta[];
  refusal?: string | null;
}

interface OpenAIToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Convert internal stop reason to OpenAI finish reason
 */
function convertStopReason(stopReason: StopReason): string | null {
  switch (stopReason) {
    case "end_turn":
      return "stop";
    case "max_tokens":
      return "length";
    case "stop_sequence":
      return "stop";
    case "tool_use":
      return "tool_calls";
    case "content_filter":
      return "content_filter";
    case null:
      return null;
  }
}

/**
 * Extract text content from internal content blocks
 */
function extractTextContent(content: InternalContentBlock[]): string {
  const textParts: string[] = [];
  const thinkingParts: string[] = [];

  for (const block of content) {
    if (block.type === "text") {
      textParts.push(block.text);
    } else if (block.type === "thinking") {
      thinkingParts.push(block.thinking);
    }
  }

  // Prepend thinking content wrapped in <think> tags if present
  let result = "";
  if (thinkingParts.length > 0) {
    result += `<think>${thinkingParts.join("")}</think>\n`;
  }
  result += textParts.join("");

  return result;
}

/**
 * Convert internal tool use blocks to OpenAI tool calls
 */
function convertToolCalls(
  content: InternalContentBlock[],
): OpenAIToolCall[] | undefined {
  const toolUseBlocks = content.filter((b) => b.type === "tool_use");

  if (toolUseBlocks.length === 0) {
    return undefined;
  }

  return toolUseBlocks.map((block) => ({
    id: block.id,
    type: "function" as const,
    function: {
      name: block.name,
      arguments: JSON.stringify(block.input),
    },
  }));
}

// =============================================================================
// Response Adapter Implementation
// =============================================================================

export const openaiChatResponseAdapter: ResponseAdapter<OpenAIChatCompletion> =
  {
    format: "openai-chat",

    serialize(response: InternalResponse): OpenAIChatCompletion {
      const content = extractTextContent(response.content);
      const toolCalls = convertToolCalls(response.content);

      return {
        id: response.id,
        object: "chat.completion",
        created: response.createdAt || Math.floor(Date.now() / 1000),
        model: response.model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: content || null,
              tool_calls: toolCalls,
            },
            finish_reason: convertStopReason(response.stopReason),
          },
        ],
        usage: {
          prompt_tokens: response.usage.inputTokens,
          completion_tokens: response.usage.outputTokens,
          total_tokens:
            response.usage.inputTokens + response.usage.outputTokens,
        },
      };
    },

    serializeStreamChunk(chunk: InternalStreamChunk): string {
      const timestamp = Math.floor(Date.now() / 1000);

      switch (chunk.type) {
        case "message_start": {
          // Send initial chunk with role
          const data: OpenAIChatCompletionChunk = {
            id: chunk.message?.id || `chatcmpl-${Date.now()}`,
            object: "chat.completion.chunk",
            created: timestamp,
            model: chunk.message?.model || "",
            choices: [
              {
                index: 0,
                delta: { role: "assistant" },
                finish_reason: null,
              },
            ],
          };
          return `data: ${JSON.stringify(data)}\n\n`;
        }

        case "content_block_start": {
          // For tool use blocks, send tool_calls delta
          if (chunk.contentBlock?.type === "tool_use") {
            const toolBlock = chunk.contentBlock;
            const data: OpenAIChatCompletionChunk = {
              id: `chatcmpl-${Date.now()}`,
              object: "chat.completion.chunk",
              created: timestamp,
              model: "",
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index: chunk.index || 0,
                        id: toolBlock.id,
                        type: "function",
                        function: {
                          name: toolBlock.name,
                          arguments: "",
                        },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            };
            return `data: ${JSON.stringify(data)}\n\n`;
          }
          return "";
        }

        case "content_block_delta": {
          if (chunk.delta?.type === "text_delta" && chunk.delta.text) {
            const data: OpenAIChatCompletionChunk = {
              id: `chatcmpl-${Date.now()}`,
              object: "chat.completion.chunk",
              created: timestamp,
              model: "",
              choices: [
                {
                  index: 0,
                  delta: { content: chunk.delta.text },
                  finish_reason: null,
                },
              ],
            };
            return `data: ${JSON.stringify(data)}\n\n`;
          }
          if (chunk.delta?.type === "thinking_delta" && chunk.delta.thinking) {
            // Wrap thinking in delta with reasoning_content for compatibility
            const delta: OpenAIChatDelta & { reasoning_content?: string } = {
              content: null,
              reasoning_content: chunk.delta.thinking,
            };
            const data: OpenAIChatCompletionChunk = {
              id: `chatcmpl-${Date.now()}`,
              object: "chat.completion.chunk",
              created: timestamp,
              model: "",
              choices: [
                {
                  index: 0,
                  delta,
                  finish_reason: null,
                },
              ],
            };
            return `data: ${JSON.stringify(data)}\n\n`;
          }
          if (
            chunk.delta?.type === "input_json_delta" &&
            chunk.delta.partialJson
          ) {
            // Tool arguments delta
            const data: OpenAIChatCompletionChunk = {
              id: `chatcmpl-${Date.now()}`,
              object: "chat.completion.chunk",
              created: timestamp,
              model: "",
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index: chunk.index || 0,
                        function: {
                          arguments: chunk.delta.partialJson,
                        },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            };
            return `data: ${JSON.stringify(data)}\n\n`;
          }
          return "";
        }

        case "content_block_stop":
          // OpenAI format doesn't have explicit block stop events
          return "";

        case "message_delta": {
          // Send finish reason and usage
          const data: OpenAIChatCompletionChunk = {
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion.chunk",
            created: timestamp,
            model: "",
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: convertStopReason(
                  chunk.messageDelta?.stopReason || null,
                ),
              },
            ],
            usage: chunk.usage
              ? {
                  prompt_tokens: chunk.usage.inputTokens,
                  completion_tokens: chunk.usage.outputTokens,
                  total_tokens:
                    chunk.usage.inputTokens + chunk.usage.outputTokens,
                }
              : undefined,
          };
          return `data: ${JSON.stringify(data)}\n\n`;
        }

        case "message_stop":
          return "";

        case "error":
          // Return error as a regular message for now
          return "";
      }
    },

    getDoneMarker(): string {
      return "data: [DONE]\n\n";
    },
  };
