/**
 * Safe JSON parsing utilities
 * Handles malformed JSON from upstream LLM providers gracefully
 */

/**
 * Safely parse JSON string for tool call arguments.
 * Returns empty object on failure, since empty arguments is a valid degraded state.
 */
export function safeParseToolArgs(jsonString: string): Record<string, unknown> {
  try {
    return JSON.parse(jsonString) as Record<string, unknown>;
  } catch {
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
    throw new Error(
      `Failed to parse ${context} response as JSON: ${preview}`,
      { cause },
    );
  }
}
