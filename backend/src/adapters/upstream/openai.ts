/**
 * OpenAI upstream adapter
 * Handles communication with OpenAI-compatible APIs
 */

import type {
  InternalContentBlock,
  InternalMessage,
  InternalRequest,
  InternalResponse,
  InternalStreamChunk,
  InternalToolDefinition,
  InternalUsage,
  ProviderConfig,
  StopReason,
  TextContentBlock,
  ThinkingContentBlock,
  ToolUseContentBlock,
  UpstreamAdapter,
} from "../types";

// =============================================================================
// OpenAI Request/Response Types
// =============================================================================

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stream_options?: { include_usage: boolean };
  stop?: string[];
  tools?: OpenAITool[];
  tool_choice?: string | { type: string; function: { name: string } };
  [key: string]: unknown;
}

interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIChoice {
  index: number;
  message: {
    role: string;
    content: string | null;
    tool_calls?: OpenAIToolCall[];
    reasoning_content?: string;
  };
  finish_reason: string | null;
}

interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIStreamChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChoice {
  index: number;
  delta: {
    role?: string;
    content?: string | null;
    tool_calls?: OpenAIToolCallDelta[];
    reasoning_content?: string;
  };
  finish_reason: string | null;
}

interface OpenAIToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Convert internal message to OpenAI format
 */
function convertMessage(msg: InternalMessage): OpenAIMessage {
  // Handle tool messages
  if (msg.role === "tool") {
    const content =
      typeof msg.content === "string"
        ? msg.content
        : msg.content
            .filter((b) => b.type === "tool_result")
            .map((b) => (b as { content: string }).content)
            .join("\n");
    return {
      role: "tool",
      content,
      tool_call_id: msg.toolCallId || "",
    };
  }

  // Handle assistant messages with tool calls
  if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
    const textContent =
      typeof msg.content === "string"
        ? msg.content
        : msg.content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("");
    return {
      role: "assistant",
      content: textContent || null,
      tool_calls: msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.input),
        },
      })),
    };
  }

  // Regular messages
  const content =
    typeof msg.content === "string"
      ? msg.content
      : msg.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("");

  return {
    role: msg.role,
    content,
  };
}

/**
 * Convert internal tools to OpenAI format
 */
function convertTools(
  tools?: InternalToolDefinition[],
): OpenAITool[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

/**
 * Convert internal tool choice to OpenAI format
 */
function convertToolChoice(
  toolChoice?: InternalRequest["toolChoice"],
): OpenAIChatRequest["tool_choice"] {
  if (!toolChoice) {
    return undefined;
  }
  if (toolChoice === "auto" || toolChoice === "none") {
    return toolChoice;
  }
  if (toolChoice === "any") {
    return "required";
  }
  if (typeof toolChoice === "object" && toolChoice.type === "tool") {
    return { type: "function", function: { name: toolChoice.name } };
  }
  return "auto";
}

/**
 * Convert OpenAI finish reason to internal stop reason
 */
function convertFinishReason(finishReason: string | null): StopReason {
  switch (finishReason) {
    case "stop":
      return "end_turn";
    case "length":
      return "max_tokens";
    case "tool_calls":
      return "tool_use";
    case "content_filter":
      return "content_filter";
    default:
      return null;
  }
}

/**
 * Convert OpenAI response to internal format
 */
function convertResponse(resp: OpenAIChatResponse): InternalResponse {
  const choice = resp.choices[0];
  const content: InternalContentBlock[] = [];

  // Handle reasoning content (for o1/deepseek models)
  if (choice?.message.reasoning_content) {
    content.push({
      type: "thinking",
      thinking: choice.message.reasoning_content,
    } as ThinkingContentBlock);
  }

  // Handle text content
  if (choice?.message.content) {
    content.push({
      type: "text",
      text: choice.message.content,
    } as TextContentBlock);
  }

  // Handle tool calls
  if (choice?.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      } as ToolUseContentBlock);
    }
  }

  return {
    id: resp.id,
    model: resp.model,
    content,
    stopReason: convertFinishReason(choice?.finish_reason || null),
    usage: {
      inputTokens: resp.usage?.prompt_tokens || -1,
      outputTokens: resp.usage?.completion_tokens || -1,
    },
    createdAt: resp.created,
  };
}

// =============================================================================
// SSE Parser
// =============================================================================

async function* parseOpenAISse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const decoder = new TextDecoderStream();
  const reader = body.pipeThrough(decoder).getReader();
  let buffer = "";

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
      if (trimmed.startsWith("data: ")) {
        yield trimmed.slice(6);
      }
    }
  }

  // Process remaining buffer
  if (buffer.trim().startsWith("data: ")) {
    yield buffer.trim().slice(6);
  }
}

// =============================================================================
// Upstream Adapter Implementation
// =============================================================================

export const openaiUpstreamAdapter: UpstreamAdapter = {
  providerType: "openai",

  buildRequest(
    request: InternalRequest,
    provider: ProviderConfig,
  ): { url: string; init: RequestInit } {
    // Build messages array with system prompt
    const messages: OpenAIMessage[] = [];

    if (request.systemPrompt) {
      messages.push({
        role: "system",
        content: request.systemPrompt,
      });
    }

    for (const msg of request.messages) {
      messages.push(convertMessage(msg));
    }

    // Build request body
    const body: OpenAIChatRequest = {
      model: request.model,
      messages,
      ...(request.maxTokens && { max_tokens: request.maxTokens }),
      ...(request.temperature !== undefined && {
        temperature: request.temperature,
      }),
      ...(request.topP !== undefined && { top_p: request.topP }),
      ...(request.stream !== undefined && { stream: request.stream }),
      ...(request.stream && { stream_options: { include_usage: true } }),
      ...(request.stopSequences && { stop: request.stopSequences }),
      ...(request.tools && { tools: convertTools(request.tools) }),
      ...(request.toolChoice && {
        tool_choice: convertToolChoice(request.toolChoice),
      }),
      ...request.extraParams,
    };

    // Build URL
    const baseUrl = provider.baseUrl.endsWith("/")
      ? provider.baseUrl.slice(0, -1)
      : provider.baseUrl;
    const url = `${baseUrl}/chat/completions`;

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
    const json = JSON.parse(text) as OpenAIChatResponse;
    return convertResponse(json);
  },

  async *parseStreamResponse(
    response: Response,
  ): AsyncGenerator<InternalStreamChunk, void, unknown> {
    if (!response.body) {
      throw new Error("Response body is null");
    }

    const chunks = parseOpenAISse(response.body);
    let isFirst = true;
    let responseId = "";
    let model = "";
    let blockIndex = 0;
    let currentToolCallIndex = -1;
    const toolCalls: Map<number, { id: string; name: string }> = new Map();

    for await (const chunk of chunks) {
      if (chunk === "[DONE]") {
        // Emit message_stop
        yield { type: "message_stop" };
        break;
      }

      let data: OpenAIStreamChunk;
      try {
        data = JSON.parse(chunk) as OpenAIStreamChunk;
      } catch {
        continue;
      }

      responseId = data.id;
      model = data.model;

      // Emit message_start for first chunk
      if (isFirst) {
        isFirst = false;
        yield {
          type: "message_start",
          message: {
            id: responseId,
            model,
            content: [],
            stopReason: null,
            usage: { inputTokens: 0, outputTokens: 0 },
          },
        };
        // Start content block for text
        yield {
          type: "content_block_start",
          index: blockIndex,
          contentBlock: { type: "text", text: "" },
        };
      }

      const choice = data.choices[0];
      if (!choice) {
        continue;
      }

      // Handle reasoning content (thinking)
      if (choice.delta.reasoning_content) {
        yield {
          type: "content_block_delta",
          index: blockIndex,
          delta: {
            type: "thinking_delta",
            thinking: choice.delta.reasoning_content,
          },
        };
      }

      // Handle text content
      if (choice.delta.content) {
        yield {
          type: "content_block_delta",
          index: blockIndex,
          delta: {
            type: "text_delta",
            text: choice.delta.content,
          },
        };
      }

      // Handle tool calls
      if (choice.delta.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          if (tc.index !== currentToolCallIndex) {
            // New tool call
            if (currentToolCallIndex >= 0) {
              yield {
                type: "content_block_stop",
                index: currentToolCallIndex + 1,
              };
            }
            currentToolCallIndex = tc.index;
            blockIndex++;
            toolCalls.set(tc.index, {
              id: tc.id || "",
              name: tc.function?.name || "",
            });
            yield {
              type: "content_block_start",
              index: blockIndex,
              contentBlock: {
                type: "tool_use",
                id: tc.id || "",
                name: tc.function?.name || "",
                input: {},
              },
            };
          }
          if (tc.function?.arguments) {
            yield {
              type: "content_block_delta",
              index: blockIndex,
              delta: {
                type: "input_json_delta",
                partialJson: tc.function.arguments,
              },
            };
          }
        }
      }

      // Handle finish reason
      if (choice.finish_reason) {
        yield { type: "content_block_stop", index: blockIndex };
        const usage: InternalUsage = data.usage
          ? {
              inputTokens: data.usage.prompt_tokens,
              outputTokens: data.usage.completion_tokens,
            }
          : { inputTokens: -1, outputTokens: -1 };
        yield {
          type: "message_delta",
          messageDelta: {
            stopReason: convertFinishReason(choice.finish_reason),
          },
          usage,
        };
      }
    }
  },
};
