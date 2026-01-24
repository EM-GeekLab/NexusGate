/**
 * OpenAI Response API request adapter
 * Converts OpenAI Response API format requests to internal format
 */

import type {
  ImageContentBlock,
  ImageSource,
  InternalContentBlock,
  InternalMessage,
  InternalRequest,
  InternalToolDefinition,
  JsonSchema,
  RequestAdapter,
  ToolResultContentBlock,
} from "../types";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse a data URL into base64 source, or return URL source for regular URLs
 * Data URL format: data:[<mediatype>][;base64],<data>
 */
function parseImageUrl(url: string): ImageSource {
  if (url.startsWith("data:")) {
    // Parse data URL: data:image/jpeg;base64,/9j/4AAQ...
    const match = url.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/);
    if (match) {
      const mediaType = match[1] || "image/jpeg";
      const data = match[2] || "";
      return {
        type: "base64",
        mediaType,
        data,
      };
    }
  }
  // Regular URL
  return {
    type: "url",
    url,
  };
}

// =============================================================================
// OpenAI Response API Request Types
// =============================================================================

interface ResponseApiContentPart {
  type: "input_text" | "input_audio" | "input_image" | "text" | "refusal";
  text?: string;
  audio?: { data: string; format: string };
  image_url?: string;
  file_id?: string;
}

interface ResponseApiMessage {
  type: "message";
  role: "user" | "assistant" | "system";
  content: string | ResponseApiContentPart[];
}

interface ResponseApiItemReference {
  type: "item_reference";
  id: string;
}

interface ResponseApiFunctionCallOutput {
  type: "function_call_output";
  call_id: string;
  output: string;
}

type ResponseApiInputItem =
  | ResponseApiMessage
  | ResponseApiItemReference
  | ResponseApiFunctionCallOutput;

interface ResponseApiTool {
  type: "function";
  name: string;
  description?: string;
  parameters?: JsonSchema;
  strict?: boolean;
}

interface ResponseApiRequest {
  model: string;
  input?: string | ResponseApiInputItem[];
  instructions?: string;
  modalities?: ("text" | "audio")[];
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: ResponseApiTool[];
  tool_choice?:
    | "auto"
    | "none"
    | "required"
    | { type: "function"; name: string };
  parallel_tool_calls?: boolean;
  previous_response_id?: string;
  store?: boolean;
  metadata?: Record<string, string>;
  [key: string]: unknown;
}

// =============================================================================
// Known Fields (for extracting extra body)
// =============================================================================

const KNOWN_FIELDS = new Set([
  "model",
  "input",
  "instructions",
  "modalities",
  "max_output_tokens",
  "temperature",
  "top_p",
  "stream",
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  "previous_response_id",
  "store",
  "metadata",
]);

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Convert Response API content parts to string or content blocks
 */
function convertContentParts(
  parts: ResponseApiContentPart[],
): string | InternalContentBlock[] {
  const hasImages = parts.some((p) => p.type === "input_image");

  if (!hasImages) {
    // Simple case: text only
    return parts
      .filter((p) => p.type === "input_text" || p.type === "text")
      .map((p) => p.text || "")
      .join("");
  }

  // Complex case: includes images
  const blocks: InternalContentBlock[] = [];
  for (const part of parts) {
    if (part.type === "input_text" || part.type === "text") {
      if (part.text) {
        blocks.push({ type: "text", text: part.text });
      }
    } else if (part.type === "input_image" && part.image_url) {
      // Parse URL - handles both regular URLs and data URLs (base64)
      const source = parseImageUrl(part.image_url);
      blocks.push({
        type: "image",
        source,
      } as ImageContentBlock);
    }
  }
  return blocks;
}

/**
 * Convert Response API input item to internal message
 */
function convertInputItem(item: ResponseApiInputItem): InternalMessage | null {
  if (item.type === "message") {
    const content =
      typeof item.content === "string"
        ? item.content
        : convertContentParts(item.content);
    return {
      role: item.role,
      content,
    };
  }

  if (item.type === "function_call_output") {
    const toolResult: ToolResultContentBlock = {
      type: "tool_result",
      toolUseId: item.call_id,
      content: item.output,
    };
    return {
      role: "tool",
      content: [toolResult],
      toolCallId: item.call_id,
    };
  }

  // Skip item references for now
  return null;
}

/**
 * Convert Response API input to internal messages
 */
function convertInput(
  input?: string | ResponseApiInputItem[],
): InternalMessage[] {
  if (!input) {
    return [];
  }

  if (typeof input === "string") {
    return [
      {
        role: "user",
        content: input,
      },
    ];
  }

  const messages: InternalMessage[] = [];
  for (const item of input) {
    const converted = convertInputItem(item);
    if (converted) {
      messages.push(converted);
    }
  }
  return messages;
}

/**
 * Convert Response API tools to internal tool definitions
 */
function convertTools(
  tools?: ResponseApiTool[],
): InternalToolDefinition[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters || { type: "object" },
  }));
}

/**
 * Convert Response API tool choice to internal format
 */
function convertToolChoice(
  toolChoice?: ResponseApiRequest["tool_choice"],
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
    return { type: "tool", name: toolChoice.name };
  }
  return "auto";
}

// =============================================================================
// Request Adapter Implementation
// =============================================================================

export const openaiResponseRequestAdapter: RequestAdapter<ResponseApiRequest> =
  {
    format: "openai-responses",

    parse(request: ResponseApiRequest): InternalRequest {
      return {
        model: request.model,
        messages: convertInput(request.input),
        systemPrompt: request.instructions,
        maxTokens: request.max_output_tokens,
        temperature: request.temperature,
        topP: request.top_p,
        stream: request.stream,
        tools: convertTools(request.tools),
        toolChoice: convertToolChoice(request.tool_choice),
        extraParams: this.extractExtraBody?.(
          request as Record<string, unknown>,
        ),
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
