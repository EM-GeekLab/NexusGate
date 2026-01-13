/**
 * Tool conversion utilities
 * Handles conversion of tool definitions and tool calls between different API formats
 */

import type {
  InternalToolDefinition,
  JsonSchema,
  ToolUseContentBlock,
} from "./types";

// =============================================================================
// OpenAI Tool Types
// =============================================================================

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: JsonSchema;
    strict?: boolean;
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

// =============================================================================
// Anthropic Tool Types
// =============================================================================

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: JsonSchema;
  cache_control?: { type: "ephemeral" };
}

interface AnthropicToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// =============================================================================
// Tool Definition Conversions
// =============================================================================

/**
 * Convert internal tool definitions to OpenAI format
 */
export function toOpenAITools(tools: InternalToolDefinition[]): OpenAITool[] {
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
 * Convert OpenAI tools to internal format
 */
export function fromOpenAITools(tools: OpenAITool[]): InternalToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    inputSchema: tool.function.parameters || { type: "object" },
  }));
}

/**
 * Convert internal tool definitions to Anthropic format
 */
export function toAnthropicTools(tools: InternalToolDefinition[]): AnthropicTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

/**
 * Convert Anthropic tools to internal format
 */
export function fromAnthropicTools(tools: AnthropicTool[]): InternalToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.input_schema,
  }));
}

// =============================================================================
// Tool Call Conversions
// =============================================================================

/**
 * Convert internal tool use blocks to OpenAI tool calls
 */
export function toOpenAIToolCalls(toolUses: ToolUseContentBlock[]): OpenAIToolCall[] {
  return toolUses.map((tu) => ({
    id: tu.id,
    type: "function" as const,
    function: {
      name: tu.name,
      arguments: JSON.stringify(tu.input),
    },
  }));
}

/**
 * Convert OpenAI tool calls to internal tool use blocks
 */
export function fromOpenAIToolCalls(toolCalls: OpenAIToolCall[]): ToolUseContentBlock[] {
  return toolCalls.map((tc) => ({
    type: "tool_use" as const,
    id: tc.id,
    name: tc.function.name,
    input: parseJsonSafe(tc.function.arguments),
  }));
}

/**
 * Convert internal tool use blocks to Anthropic tool use
 */
export function toAnthropicToolUse(toolUses: ToolUseContentBlock[]): AnthropicToolUse[] {
  return toolUses.map((tu) => ({
    type: "tool_use" as const,
    id: tu.id,
    name: tu.name,
    input: tu.input,
  }));
}

/**
 * Convert Anthropic tool use to internal tool use blocks
 */
export function fromAnthropicToolUse(
  toolUses: AnthropicToolUse[]
): ToolUseContentBlock[] {
  return toolUses.map((tu) => ({
    type: "tool_use" as const,
    id: tu.id,
    name: tu.name,
    input: tu.input,
  }));
}

// =============================================================================
// Tool Choice Conversions
// =============================================================================

type InternalToolChoice =
  | "auto"
  | "any"
  | "none"
  | { type: "tool"; name: string };

type OpenAIToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } };

type AnthropicToolChoice = { type: "auto" | "any" | "tool"; name?: string };

/**
 * Convert internal tool choice to OpenAI format
 */
export function toOpenAIToolChoice(
  choice: InternalToolChoice | undefined
): OpenAIToolChoice | undefined {
  if (!choice) return undefined;
  if (choice === "auto") return "auto";
  if (choice === "none") return "none";
  if (choice === "any") return "required";
  if (typeof choice === "object" && choice.type === "tool") {
    return { type: "function", function: { name: choice.name } };
  }
  return "auto";
}

/**
 * Convert OpenAI tool choice to internal format
 */
export function fromOpenAIToolChoice(
  choice: OpenAIToolChoice | undefined
): InternalToolChoice | undefined {
  if (!choice) return undefined;
  if (choice === "auto") return "auto";
  if (choice === "none") return "none";
  if (choice === "required") return "any";
  if (typeof choice === "object" && choice.type === "function") {
    return { type: "tool", name: choice.function.name };
  }
  return "auto";
}

/**
 * Convert internal tool choice to Anthropic format
 */
export function toAnthropicToolChoice(
  choice: InternalToolChoice | undefined
): AnthropicToolChoice | undefined {
  if (!choice) return undefined;
  if (choice === "auto") return { type: "auto" };
  if (choice === "any") return { type: "any" };
  if (choice === "none") return undefined; // Anthropic doesn't have explicit "none"
  if (typeof choice === "object" && choice.type === "tool") {
    return { type: "tool", name: choice.name };
  }
  return { type: "auto" };
}

/**
 * Convert Anthropic tool choice to internal format
 */
export function fromAnthropicToolChoice(
  choice: AnthropicToolChoice | undefined
): InternalToolChoice | undefined {
  if (!choice) return undefined;
  if (choice.type === "auto") return "auto";
  if (choice.type === "any") return "any";
  if (choice.type === "tool" && choice.name) {
    return { type: "tool", name: choice.name };
  }
  return "auto";
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Safely parse JSON string, returning empty object on failure
 */
function parseJsonSafe(jsonString: string): Record<string, unknown> {
  try {
    return JSON.parse(jsonString) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Generate a unique tool call ID
 */
export function generateToolCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Validate tool input against schema (basic validation)
 */
export function validateToolInput(
  input: Record<string, unknown>,
  schema: JsonSchema
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  if (schema.required && Array.isArray(schema.required)) {
    for (const field of schema.required) {
      if (!(field in input)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Check property types (basic)
  if (schema.properties) {
    for (const [key, value] of Object.entries(input)) {
      const propSchema = schema.properties[key];
      if (propSchema) {
        const expectedType = propSchema.type;
        const actualType = Array.isArray(value) ? "array" : typeof value;
        if (expectedType && expectedType !== actualType) {
          errors.push(
            `Field '${key}' expected type '${expectedType}' but got '${actualType}'`
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
