/**
 * OpenAI Response API upstream adapter
 * Handles communication with OpenAI Response API
 */

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
  ToolResultContentBlock,
  ToolUseContentBlock,
  UpstreamAdapter,
} from "../types";

// =============================================================================
// Response API Types
// =============================================================================

interface ResponseApiContentPart {
  type: "input_text" | "output_text" | "refusal";
  text?: string;
}

interface ResponseApiInputItem {
  type: "message" | "function_call_output";
  role?: "user" | "assistant" | "system";
  content?: string | ResponseApiContentPart[];
  call_id?: string;
  output?: string;
}

interface ResponseApiTool {
  type: "function";
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  strict?: boolean;
}

interface ResponseApiRequest {
  model: string;
  input?: string | ResponseApiInputItem[];
  instructions?: string;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: ResponseApiTool[];
  tool_choice?: string | { type: string; name: string };
  [key: string]: unknown;
}

interface ResponseApiOutput {
  type: "message" | "function_call" | "reasoning";
  id?: string;
  role?: "assistant";
  content?: ResponseApiContentPart[];
  call_id?: string;
  name?: string;
  arguments?: string;
  status?: string;
}

interface ResponseApiResponse {
  id: string;
  object: "response";
  created_at: number;
  status: "completed" | "failed" | "incomplete" | "in_progress";
  output: ResponseApiOutput[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  model: string;
}

interface ResponseApiStreamEvent {
  type: string;
  response?: ResponseApiResponse;
  output_index?: number;
  content_index?: number;
  item?: ResponseApiOutput;
  delta?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
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
 * Convert internal message to Response API input item
 */
function convertMessage(msg: InternalMessage): ResponseApiInputItem | null {
  if (msg.role === "system") {
    return null; // System messages go to instructions
  }

  if (msg.role === "tool") {
    // Convert tool result to function_call_output
    const content =
      typeof msg.content === "string"
        ? msg.content
        : msg.content
            .filter((b) => b.type === "tool_result")
            .map((b) => (b as ToolResultContentBlock).content)
            .join("\n");
    return {
      type: "function_call_output",
      call_id: msg.toolCallId || "",
      output: content,
    };
  }

  // Regular messages
  const content =
    typeof msg.content === "string"
      ? msg.content
      : msg.content
          .filter((b) => b.type === "text")
          .map((b) => (b as TextContentBlock).text)
          .join("");

  return {
    type: "message",
    role: msg.role as "user" | "assistant",
    content,
  };
}

/**
 * Convert internal tools to Response API format
 */
function convertTools(tools?: InternalToolDefinition[]): ResponseApiTool[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));
}

/**
 * Convert Response API status to internal stop reason
 */
function convertStatus(status: string): StopReason {
  switch (status) {
    case "completed":
      return "end_turn";
    case "incomplete":
      return "max_tokens";
    case "failed":
      return "content_filter";
    default:
      return null;
  }
}

/**
 * Convert Response API response to internal format
 */
function convertResponse(resp: ResponseApiResponse): InternalResponse {
  const content: InternalContentBlock[] = [];

  for (const output of resp.output) {
    if (output.type === "message" && output.content) {
      for (const part of output.content) {
        if (part.type === "output_text" && part.text) {
          content.push({ type: "text", text: part.text } as TextContentBlock);
        }
      }
    } else if (output.type === "function_call") {
      content.push({
        type: "tool_use",
        id: output.call_id || output.id || "",
        name: output.name || "",
        input: output.arguments ? JSON.parse(output.arguments) : {},
      } as ToolUseContentBlock);
    }
  }

  return {
    id: resp.id,
    model: resp.model,
    content,
    stopReason: convertStatus(resp.status),
    usage: {
      inputTokens: resp.usage?.input_tokens || -1,
      outputTokens: resp.usage?.output_tokens || -1,
    },
    createdAt: resp.created_at,
  };
}

// =============================================================================
// SSE Parser
// =============================================================================

async function* parseResponseApiSse(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<ResponseApiStreamEvent, void, unknown> {
  const decoder = new TextDecoderStream();
  // @ts-expect-error: TypeScript's TextDecoderStream type is incompatible with pipeThrough, but works at runtime
  const reader = body.pipeThrough(decoder).getReader();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;

    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      // Handle both "data: " (standard) and "data:" (some providers like Alibaba DashScope)
      if (trimmed.startsWith("data:")) {
        const data = trimmed.startsWith("data: ")
          ? trimmed.slice(6)
          : trimmed.slice(5);
        if (data === "[DONE]") {
          return;
        }
        try {
          yield JSON.parse(data) as ResponseApiStreamEvent;
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

export const openaiResponsesUpstreamAdapter: UpstreamAdapter = {
  providerType: "openai-responses",

  buildRequest(
    request: InternalRequest,
    provider: ProviderConfig
  ): { url: string; init: RequestInit } {
    // Build input array
    const input: ResponseApiInputItem[] = [];

    for (const msg of request.messages) {
      const converted = convertMessage(msg);
      if (converted) {
        input.push(converted);
      }
    }

    // Build request body
    const body: ResponseApiRequest = {
      model: request.model,
      input: input.length > 0 ? input : undefined,
      ...(request.systemPrompt && { instructions: request.systemPrompt }),
      ...(request.maxTokens && { max_output_tokens: request.maxTokens }),
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.topP !== undefined && { top_p: request.topP }),
      ...(request.stream !== undefined && { stream: request.stream }),
      ...(request.tools && { tools: convertTools(request.tools) }),
      ...request.extraParams,
    };

    // Build URL
    const baseUrl = provider.baseUrl.endsWith("/")
      ? provider.baseUrl.slice(0, -1)
      : provider.baseUrl;
    const url = `${baseUrl}/responses`;

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (provider.apiKey) {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
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
    const json = JSON.parse(text) as ResponseApiResponse;
    return convertResponse(json);
  },

  async *parseStreamResponse(
    response: Response
  ): AsyncGenerator<InternalStreamChunk, void, unknown> {
    if (!response.body) {
      throw new Error("Response body is null");
    }

    const events = parseResponseApiSse(response.body);
    let currentIndex = 0;

    for await (const event of events) {
      switch (event.type) {
        case "response.created": {
          const resp = event.response;
          yield {
            type: "message_start",
            message: resp
              ? {
                  id: resp.id,
                  model: resp.model,
                  content: [],
                  stopReason: null,
                  usage: { inputTokens: 0, outputTokens: 0 },
                }
              : undefined,
          };
          break;
        }

        case "response.output_item.added": {
          const item = event.item;
          if (item?.type === "message") {
            yield {
              type: "content_block_start",
              index: event.output_index || currentIndex,
              contentBlock: { type: "text", text: "" },
            };
          } else if (item?.type === "reasoning") {
            // Handle reasoning/thinking blocks (e.g., from Alibaba DashScope)
            yield {
              type: "content_block_start",
              index: event.output_index || currentIndex,
              contentBlock: { type: "thinking", thinking: "" },
            };
          } else if (item?.type === "function_call") {
            yield {
              type: "content_block_start",
              index: event.output_index || currentIndex,
              contentBlock: {
                type: "tool_use",
                id: item.call_id || item.id || "",
                name: item.name || "",
                input: {},
              },
            };
          }
          currentIndex = (event.output_index || currentIndex) + 1;
          break;
        }

        case "response.output_text.delta": {
          if (event.delta) {
            yield {
              type: "content_block_delta",
              index: event.output_index || 0,
              delta: { type: "text_delta", text: event.delta },
            };
          }
          break;
        }

        case "response.reasoning_summary_text.delta": {
          // Handle reasoning/thinking text delta (e.g., from Alibaba DashScope)
          if (event.delta) {
            yield {
              type: "content_block_delta",
              index: event.output_index || 0,
              delta: { type: "thinking_delta", thinking: event.delta },
            };
          }
          break;
        }

        case "response.function_call_arguments.delta": {
          if (event.delta) {
            yield {
              type: "content_block_delta",
              index: event.output_index || 0,
              delta: { type: "input_json_delta", partialJson: event.delta },
            };
          }
          break;
        }

        case "response.output_item.done": {
          yield {
            type: "content_block_stop",
            index: event.output_index || 0,
          };
          break;
        }

        case "response.usage": {
          if (event.usage) {
            yield {
              type: "message_delta",
              usage: {
                inputTokens: event.usage.input_tokens,
                outputTokens: event.usage.output_tokens,
              },
            };
          }
          break;
        }

        case "response.done": {
          const resp = event.response;
          yield {
            type: "message_delta",
            messageDelta: {
              stopReason: resp ? convertStatus(resp.status) : "end_turn",
            },
          };
          yield { type: "message_stop" };
          break;
        }

        case "error": {
          yield {
            type: "error",
            error: {
              type: event.error?.type || "server_error",
              message: event.error?.message || "Unknown error",
            },
          };
          break;
        }
      }
    }
  },
};
