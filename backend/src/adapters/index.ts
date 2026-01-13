/**
 * Adapter factory and registry
 * Provides functions to get the appropriate adapter for each format/provider type
 */

import type {
  ApiFormat,
  ProviderType,
  RequestAdapter,
  ResponseAdapter,
  UpstreamAdapter,
} from "./types";

// Import request adapters
import { openaiChatRequestAdapter } from "./request/openai-chat";
import { anthropicRequestAdapter } from "./request/anthropic";
import { openaiResponseRequestAdapter } from "./request/openai-response";

// Import response adapters
import { openaiChatResponseAdapter } from "./response/openai-chat";
import { anthropicResponseAdapter } from "./response/anthropic";
import { openaiResponseResponseAdapter } from "./response/openai-response";

// Import upstream adapters
import { openaiUpstreamAdapter } from "./upstream/openai";
import { anthropicUpstreamAdapter } from "./upstream/anthropic";
import { openaiResponsesUpstreamAdapter } from "./upstream/openai-responses";

// =============================================================================
// Request Adapters Registry
// =============================================================================

const requestAdapters: Record<ApiFormat, RequestAdapter> = {
  "openai-chat": openaiChatRequestAdapter,
  "openai-responses": openaiResponseRequestAdapter,
  anthropic: anthropicRequestAdapter,
};

/**
 * Get request adapter for the specified API format
 */
export function getRequestAdapter(format: ApiFormat): RequestAdapter {
  const adapter = requestAdapters[format];
  if (!adapter) {
    throw new Error(`Unknown request format: ${format}`);
  }
  return adapter;
}

// =============================================================================
// Response Adapters Registry
// =============================================================================

const responseAdapters: Record<ApiFormat, ResponseAdapter> = {
  "openai-chat": openaiChatResponseAdapter,
  "openai-responses": openaiResponseResponseAdapter,
  anthropic: anthropicResponseAdapter,
};

/**
 * Get response adapter for the specified API format
 */
export function getResponseAdapter(format: ApiFormat): ResponseAdapter {
  const adapter = responseAdapters[format];
  if (!adapter) {
    throw new Error(`Unknown response format: ${format}`);
  }
  return adapter;
}

// =============================================================================
// Upstream Adapters Registry
// =============================================================================

const upstreamAdapters: Record<ProviderType, UpstreamAdapter> = {
  openai: openaiUpstreamAdapter,
  "openai-responses": openaiResponsesUpstreamAdapter,
  anthropic: anthropicUpstreamAdapter,
  // Azure uses OpenAI-compatible API
  azure: openaiUpstreamAdapter,
  // Ollama uses OpenAI-compatible API
  ollama: openaiUpstreamAdapter,
};

/**
 * Get upstream adapter for the specified provider type
 */
export function getUpstreamAdapter(providerType: string): UpstreamAdapter {
  const adapter = upstreamAdapters[providerType as ProviderType];
  if (!adapter) {
    // Default to OpenAI adapter for unknown types (backward compatibility)
    return openaiUpstreamAdapter;
  }
  return adapter;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a provider type is supported
 */
export function isSupportedProviderType(type: string): type is ProviderType {
  return type in upstreamAdapters;
}

/**
 * Check if an API format is supported
 */
export function isSupportedApiFormat(format: string): format is ApiFormat {
  return format in requestAdapters;
}

/**
 * Get all supported API formats
 */
export function getSupportedApiFormats(): ApiFormat[] {
  return Object.keys(requestAdapters) as ApiFormat[];
}

/**
 * Get all supported provider types
 */
export function getSupportedProviderTypes(): ProviderType[] {
  return Object.keys(upstreamAdapters) as ProviderType[];
}

// Re-export types
export * from "./types";
