/**
 * Shared API helper functions for v1 endpoints
 * Extracted from completions.ts, messages.ts, and responses.ts to reduce code duplication
 */

import { consola } from "consola";
import type { InternalResponse, ModelWithProvider } from "@/adapters/types";

const logger = consola.withTag("api-helpers");

// =============================================================================
// Header Constants
// =============================================================================

/** Header prefix for NexusGate-specific headers (e.g., X-NexusGate-Provider) */
export const NEXUSGATE_HEADER_PREFIX = "x-nexusgate-";

/** Header name for provider selection */
export const PROVIDER_HEADER = "x-nexusgate-provider";

/** Headers that should NOT be forwarded to upstream */
export const EXCLUDED_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "content-type",
  "authorization",
  "x-api-key",
  "anthropic-version",
  "accept",
  "accept-encoding",
  "accept-language",
  "user-agent",
  "origin",
  "referer",
  "cookie",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
]);

// =============================================================================
// Header Extraction
// =============================================================================

/**
 * Extract headers to be forwarded to upstream
 * All headers are forwarded EXCEPT:
 * - Headers starting with "x-nexusgate-" (NexusGate-specific headers)
 * - Standard HTTP headers (host, authorization, content-type, etc.)
 */
export function extractUpstreamHeaders(
  headers: Headers,
): Record<string, string> | undefined {
  const extra: Record<string, string> = {};
  let hasExtra = false;

  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    // Skip NexusGate-specific headers and excluded standard headers
    if (
      lowerKey.startsWith(NEXUSGATE_HEADER_PREFIX) ||
      EXCLUDED_HEADERS.has(lowerKey)
    ) {
      return;
    }
    // Forward all other headers as-is
    extra[key] = value;
    hasExtra = true;
  });

  return hasExtra ? extra : undefined;
}

// =============================================================================
// Model Selection
// =============================================================================

/**
 * Select the best model/provider combination based on target provider and weights
 */
export function selectModel(
  modelsWithProviders: ModelWithProvider[],
  targetProvider?: string,
): ModelWithProvider | null {
  if (modelsWithProviders.length === 0) {
    return null;
  }

  // Filter by target provider if specified
  let candidates = modelsWithProviders;
  if (targetProvider) {
    const filtered = modelsWithProviders.filter(
      (mp) => mp.provider.name === targetProvider,
    );
    if (filtered.length > 0) {
      candidates = filtered;
    } else {
      logger.warn(
        `Provider '${targetProvider}' does not offer requested model, falling back to available providers`,
      );
    }
  }

  // TODO: implement weighted load balancing
  return candidates[0] || null;
}

// =============================================================================
// Content Extraction
// =============================================================================

/**
 * Extract text content from internal response
 * Combines thinking content (wrapped in <think> tags) and text content
 */
export function extractContentText(response: InternalResponse): string {
  const parts: string[] = [];
  const thinkingParts: string[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      parts.push(block.text);
    } else if (block.type === "thinking") {
      thinkingParts.push(block.thinking);
    }
  }

  let result = "";
  if (thinkingParts.length > 0) {
    result += `<think>${thinkingParts.join("")}</think>\n`;
  }
  result += parts.join("");
  return result;
}

// =============================================================================
// Model Parsing
// =============================================================================

/**
 * Parse model string with optional provider suffix (e.g., "gpt-4@openai")
 * Returns the system name and optional target provider
 */
export function parseModelProvider(
  model: string,
  providerHeader: string | null,
): { systemName: string; targetProvider: string | undefined } {
  // Parse model@provider format
  const modelMatch = model.match(/^(\S+)@(\S+)$/);
  // oxlint-disable-next-line no-unnecessary-type-assertion
  const systemName = modelMatch ? modelMatch[1]! : model; // conflicting with tsc

  // Determine target provider: header takes precedence over model@provider format
  const targetProvider = providerHeader
    ? decodeURIComponent(providerHeader)
    : modelMatch?.[2];

  return { systemName, targetProvider };
}
