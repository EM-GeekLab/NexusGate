/**
 * Safe JSON parsing utilities
 * Handles malformed JSON from upstream LLM providers gracefully
 */

import { consola } from "consola";

const logger = consola.withTag("json-parser");

/**
 * Safely parse JSON string for tool call arguments.
 * Returns empty object on failure, since empty arguments is a valid degraded state.
 * Also returns empty object if parsed value is not a plain object (e.g., scalar, array, null).
 */
export function safeParseToolArgs(jsonString: string): Record<string, unknown> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed: unknown = JSON.parse(jsonString);

    // Validate that parsed result is a plain object (not null, array, or scalar)
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    // If LLM returned a scalar, array, or null as tool arguments, treat as malformed
    logger.warn("Parsed tool arguments is not an object, returning empty object", {
      input: jsonString,
      parsedType: Array.isArray(parsed) ? "array" : typeof parsed,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      parsedValue: parsed,
    });
    return {};
  } catch (error) {
    logger.warn("Failed to parse tool arguments, returning empty object", {
      input: jsonString,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

/**
 * Parse JSON response body with descriptive error on failure.
 * Re-throws with context about what failed, including a preview of the input.
 * Callers are expected to have their own try-catch.
 */
export function parseJsonResponse<T>(text: string, context: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    const preview = text.length > 200 ? `${text.slice(0, 200)}...` : text;
    logger.error(`Failed to parse ${context} response as JSON`, {
      context,
      fullBody: text,
      preview,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    throw new Error(
      `Failed to parse ${context} response as JSON: ${preview}`,
      { cause },
    );
  }
}
