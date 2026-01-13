/**
 * OpenAI Chat Completion API request adapter
 * Converts OpenAI Chat format requests to internal format
 */

import type {
  InternalContentBlock,
  InternalMessage,
  InternalRequest,
  InternalToolDefinition,
  JsonSchema,
  RequestAdapter,
  TextContentBlock,
  ToolResultContentBlock,
  ToolUseContentBlock,
} from "../types";

// =============================================================================
// OpenAI Chat Request Types
// =============================================================================

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool" | "function";
  content: string | OpenAIContentPart[] | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

interface OpenAIContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
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
    parameters?: JsonSchema;
  };
}

interface OpenAIChatRequest {
  model: string;
  messages: OpenAIChatMessage[];
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stream_options?: {
    include_usage?: boolean;
  };
  stop?: string | string[];
  tools?: OpenAITool[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  [key: string]: unknown;
}

// =============================================================================
// Known Fields (for extracting extra body)
// =============================================================================

const KNOWN_FIELDS = new Set([
  "model",
  "messages",
  "max_tokens",
  "max_completion_tokens",
  "temperature",
  "top_p",
  "n",
  "stream",
  "stream_options",
  "stop",
  "tools",
  "tool_choice",
  "presence_penalty",
  "frequency_penalty",
  "logit_bias",
  "logprobs",
  "top_logprobs",
  "user",
  "seed",
  "response_format",
]);

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Convert OpenAI message content to internal content blocks
 */
function convertContent(content: string | OpenAIContentPart[] | null): string | InternalContentBlock[] {
  if (content === null) {
    return "";
  }
  if (typeof content === "string") {
    return content;
  }
  // Array of content parts - currently only support text (images not supported yet)
  const blocks: InternalContentBlock[] = [];
  for (const part of content) {
    if (part.type === "text" && part.text) {
      blocks.push({ type: "text", text: part.text });
    }
    // Skip image_url parts for now (not supported in MVP)
  }
  return blocks.length === 1 && blocks[0]!.type === "text"
    ? (blocks[0] as TextContentBlock).text
    : blocks;
}

/**
 * Convert OpenAI tool calls to internal format
 */
function convertToolCalls(toolCalls?: OpenAIToolCall[]): ToolUseContentBlock[] | undefined {
  if (!toolCalls || toolCalls.length === 0) {
    return undefined;
  }
  return toolCalls.map((tc) => ({
    type: "tool_use" as const,
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
  }));
}

/**
 * Convert OpenAI message to internal message
 */
function convertMessage(msg: OpenAIChatMessage): InternalMessage {
  const role = msg.role === "function" ? "tool" : msg.role;

  // Handle tool/function messages
  if (role === "tool") {
    const toolResult: ToolResultContentBlock = {
      type: "tool_result",
      toolUseId: msg.tool_call_id || "",
      content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
    };
    return {
      role: "tool",
      content: [toolResult],
      toolCallId: msg.tool_call_id,
    };
  }

  // Handle assistant messages with tool calls
  if (role === "assistant" && (msg.tool_calls || msg.function_call)) {
    const content = convertContent(msg.content);
    const toolCalls = msg.tool_calls
      ? convertToolCalls(msg.tool_calls)
      : msg.function_call
        ? [
            {
              type: "tool_use" as const,
              id: "legacy_function_call",
              name: msg.function_call.name,
              input: JSON.parse(msg.function_call.arguments) as Record<string, unknown>,
            },
          ]
        : undefined;

    return {
      role: "assistant",
      content,
      toolCalls,
    };
  }

  // Regular messages
  return {
    role,
    content: convertContent(msg.content),
  };
}

/**
 * Convert OpenAI tools to internal tool definitions
 */
function convertTools(tools?: OpenAITool[]): InternalToolDefinition[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    inputSchema: tool.function.parameters || { type: "object" },
  }));
}

/**
 * Convert OpenAI tool choice to internal format
 */
function convertToolChoice(
  toolChoice?: OpenAIChatRequest["tool_choice"]
): InternalRequest["toolChoice"] {
  if (!toolChoice) {
    return undefined;
  }
  if (toolChoice === "auto" || toolChoice === "none") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    return "any";
  }
  if (typeof toolChoice === "object" && toolChoice.type === "function") {
    return { type: "tool", name: toolChoice.function.name };
  }
  return "auto";
}

/**
 * Convert stop sequences to array format
 */
function convertStopSequences(stop?: string | string[]): string[] | undefined {
  if (!stop) {
    return undefined;
  }
  return Array.isArray(stop) ? stop : [stop];
}

// =============================================================================
// Request Adapter Implementation
// =============================================================================

export const openaiChatRequestAdapter: RequestAdapter<OpenAIChatRequest> = {
  format: "openai-chat",

  parse(request: OpenAIChatRequest): InternalRequest {
    // Separate system messages from other messages
    let systemPrompt: string | undefined;
    const messages: InternalMessage[] = [];

    for (const msg of request.messages) {
      if (msg.role === "system") {
        // Concatenate multiple system messages
        const content = typeof msg.content === "string" ? msg.content : "";
        systemPrompt = systemPrompt ? `${systemPrompt}\n${content}` : content;
      } else {
        messages.push(convertMessage(msg));
      }
    }

    return {
      model: request.model,
      messages,
      systemPrompt,
      maxTokens: request.max_tokens || request.max_completion_tokens,
      temperature: request.temperature,
      topP: request.top_p,
      stream: request.stream,
      tools: convertTools(request.tools),
      toolChoice: convertToolChoice(request.tool_choice),
      stopSequences: convertStopSequences(request.stop),
      extraParams: this.extractExtraBody?.(request as Record<string, unknown>),
    };
  },

  extractExtraBody(body: Record<string, unknown>): Record<string, unknown> | undefined {
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
