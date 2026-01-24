/**
 * ReqId Handler - Main logic for request deduplication
 *
 * Handles the full lifecycle of ReqId-based request deduplication:
 * 1. Check if request is a cache hit (completed/failed/aborted)
 * 2. Check if request is currently in-flight
 * 3. Create new pending requests
 * 4. Finalize requests after completion
 */

import { consola } from "consola";
import {
  findCompletionByReqId,
  createPendingCompletion,
  updateCompletion,
  insertCompletion,
  type Completion,
  type CompletionInsert,
} from "@/db";
import {
  markInFlight,
  getInFlight,
  clearInFlight,
  calculateRetryAfter,
  isRedisAvailable,
  type InFlightRequest,
} from "./reqIdCache";
import type { CachedResponseType } from "@/db/schema";

const logger = consola.withTag("reqIdHandler");

/**
 * HTTP header name for client-provided request ID
 */
export const REQID_HEADER = "x-nexusgate-reqid";

/**
 * API format types
 */
export type ApiFormat = "openai-chat" | "openai-responses" | "anthropic";

/**
 * Result types for ReqId check
 */
export type ReqIdCheckResult =
  | { type: "cache_hit"; completion: Completion }
  | { type: "in_flight"; inFlight: InFlightRequest; retryAfter: number }
  | { type: "new_request"; completionId: number }
  | { type: "no_reqid" }; // No ReqId provided - proceed normally

/**
 * Data needed to create a pending completion
 */
export interface PendingCompletionData {
  apiKeyId: number;
  model: string;
  modelId?: number;
  prompt: CompletionInsert["prompt"];
  apiFormat: ApiFormat;
  endpoint: string;
  isStream: boolean;
}

/**
 * Check ReqId status and determine how to handle the request
 *
 * Flow:
 * 1. If no ReqId provided, return no_reqid (proceed normally)
 * 2. Check database for completed request with this ReqId
 * 3. Check Redis for in-flight request with this ReqId
 * 4. Create new pending request and mark as in-flight
 *
 * @param reqId - The client-provided request ID (from header)
 * @param data - Pending completion data
 * @returns Check result indicating how to proceed
 */
export async function checkReqId(
  reqId: string | null,
  data: PendingCompletionData,
): Promise<ReqIdCheckResult> {
  // No ReqId provided - proceed with normal request flow
  if (!reqId) {
    return { type: "no_reqid" };
  }

  const { apiKeyId, model, modelId, prompt, apiFormat, endpoint, isStream } = data;

  // Step 1: Check database for existing completed request
  const existingCompletion = await findCompletionByReqId(apiKeyId, reqId);
  if (existingCompletion) {
    logger.info("Cache hit for ReqId", { reqId, completionId: existingCompletion.id });
    return { type: "cache_hit", completion: existingCompletion };
  }

  // Step 2: Check Redis for in-flight request
  // Note on race conditions when Redis is unavailable:
  // Without Redis, concurrent requests with the same ReqId will both proceed to step 3
  // (create pending completion). The database unique constraint on (api_key_id, req_id)
  // will catch this - one request succeeds and the other fails with a constraint violation,
  // triggering a re-check (lines 127-154). This means duplicate processing may occur briefly
  // until one request claims the ReqId in the database. Redis provides faster in-flight
  // detection but is not required for correctness.
  if (isRedisAvailable()) {
    const inFlight = await getInFlight(apiKeyId, reqId);
    if (inFlight) {
      const retryAfter = calculateRetryAfter(inFlight);
      logger.info("Request in-flight for ReqId", { reqId, retryAfter });
      return { type: "in_flight", inFlight, retryAfter };
    }
  } else {
    logger.warn("Redis unavailable, skipping in-flight check - race conditions possible until DB constraint catches duplicates");
  }

  // Step 3: Create pending completion and mark as in-flight
  const pendingData: CompletionInsert = {
    apiKeyId,
    model,
    modelId,
    prompt,
    promptTokens: -1,
    completion: [],
    completionTokens: -1,
    status: "pending",
    ttft: -1,
    duration: -1,
    reqId,
    apiFormat,
  };

  const newCompletion = await createPendingCompletion(pendingData);

  if (!newCompletion) {
    // Unique constraint violation - another request beat us to it
    // Re-check database (might have completed) or Redis (might be in-flight)
    logger.warn("Failed to create pending completion, re-checking state", { reqId });

    const recheck = await findCompletionByReqId(apiKeyId, reqId);
    if (recheck) {
      return { type: "cache_hit", completion: recheck };
    }

    if (isRedisAvailable()) {
      const inFlight = await getInFlight(apiKeyId, reqId);
      if (inFlight) {
        const retryAfter = calculateRetryAfter(inFlight);
        return { type: "in_flight", inFlight, retryAfter };
      }
    }

    // Shouldn't happen, but treat as in-flight with default retry
    logger.error("Unexpected state: ReqId exists but not found", { reqId });
    return {
      type: "in_flight",
      inFlight: {
        completionId: 0,
        startTime: Date.now(),
        isStream,
        endpoint,
      },
      retryAfter: 5,
    };
  }

  // Step 4: Mark as in-flight in Redis
  if (isRedisAvailable()) {
    const marked = await markInFlight(
      apiKeyId,
      reqId,
      newCompletion.id,
      endpoint,
      isStream,
    );

    if (!marked) {
      // Another process beat us - this shouldn't happen since we have DB unique constraint
      // But handle gracefully
      logger.warn("Failed to mark in-flight after DB insert", { reqId });
    }
  }

  logger.debug("Created new pending request", { reqId, completionId: newCompletion.id });
  return { type: "new_request", completionId: newCompletion.id };
}

/**
 * Finalize a request after it completes
 *
 * Updates the completion record and clears the in-flight marker
 *
 * @param apiKeyId - The API key ID
 * @param reqId - The client-provided request ID
 * @param completionId - The completion ID to update
 * @param updates - Completion updates (status, tokens, response, etc.)
 */
export async function finalizeReqId(
  apiKeyId: number,
  reqId: string,
  completionId: number,
  updates: Partial<CompletionInsert> & { cachedResponse?: CachedResponseType },
): Promise<void> {
  try {
    // Update completion record
    await updateCompletion(completionId, updates);

    // Clear in-flight marker
    if (isRedisAvailable()) {
      await clearInFlight(apiKeyId, reqId);
    }

    logger.debug("Finalized request", { reqId, completionId, status: updates.status });
  } catch (error) {
    logger.error("Failed to finalize request", { reqId, completionId, error });
    // Still try to clear in-flight marker
    if (isRedisAvailable()) {
      await clearInFlight(apiKeyId, reqId);
    }
    throw error;
  }
}

/**
 * Build a cache_hit completion record
 *
 * Creates a new completion record that references the source completion
 *
 * @param sourceCompletion - The original completion that was cached
 * @param apiKeyId - The API key ID for the new request
 * @returns CompletionInsert for the cache_hit record
 */
export function buildCacheHitRecord(
  sourceCompletion: Completion,
  apiKeyId: number,
): CompletionInsert {
  return {
    apiKeyId,
    model: sourceCompletion.model,
    modelId: sourceCompletion.modelId,
    upstreamId: sourceCompletion.upstreamId,
    prompt: sourceCompletion.prompt,
    promptTokens: 0, // Cache hit doesn't consume tokens
    completion: sourceCompletion.completion,
    completionTokens: 0, // Cache hit doesn't consume tokens
    status: "cache_hit",
    ttft: 0,
    duration: 0,
    // Note: reqId is intentionally omitted to avoid unique constraint violations
    // cache_hit records don't need their own reqId since they reference sourceCompletionId
    sourceCompletionId: sourceCompletion.id,
    apiFormat: sourceCompletion.apiFormat,
  };
}

/**
 * Record a cache hit in the database
 *
 * @param sourceCompletion - The original completion that was cached
 * @param apiKeyId - The API key ID for the new request
 * @returns The created cache_hit completion record
 */
export async function recordCacheHit(
  sourceCompletion: Completion,
  apiKeyId: number,
): Promise<Completion | null> {
  const record = buildCacheHitRecord(sourceCompletion, apiKeyId);
  return await insertCompletion(record);
}

/**
 * Build the 409 Conflict error response for in-flight requests
 *
 * @param reqId - The client-provided request ID
 * @param inFlight - The in-flight request data
 * @param retryAfter - Retry-After value in seconds
 * @param format - The API format for response formatting
 * @returns Error response object
 */
export function buildInFlightErrorResponse(
  reqId: string,
  inFlight: InFlightRequest,
  retryAfter: number,
  format: ApiFormat,
): Record<string, unknown> {
  const startedAt = new Date(inFlight.startTime).toISOString();

  if (format === "anthropic") {
    return {
      type: "error",
      error: {
        type: "conflict",
        message: "A request with this X-NexusGate-ReqId is already being processed",
        req_id: reqId,
        retry_after: retryAfter,
        started_at: startedAt,
      },
    };
  }

  // OpenAI format (openai-chat, openai-responses)
  return {
    error: {
      code: "request_in_flight",
      message: "A request with this X-NexusGate-ReqId is already being processed",
      type: "conflict",
      req_id: reqId,
      retry_after: retryAfter,
      started_at: startedAt,
    },
  };
}

/**
 * Maximum length for ReqId (database schema constraint)
 */
export const REQID_MAX_LENGTH = 127;

/**
 * Regex pattern for valid ReqId characters
 * Allows alphanumeric, hyphens, underscores, dots, colons, and forward slashes
 * This prevents control characters, null bytes, and other potentially problematic characters
 */
const REQID_VALID_PATTERN = /^[\w\-.:/]+$/;

/**
 * Result type for extractReqId
 */
export type ExtractReqIdResult =
  | { type: "valid"; value: string }
  | { type: "empty" }
  | { type: "too_long"; length: number }
  | { type: "invalid_characters" };

/**
 * Extract and validate ReqId from request headers
 *
 * @param headers - Request headers
 * @returns Extraction result indicating valid value, empty, or error
 */
export function extractReqId(headers: Headers): ExtractReqIdResult {
  const reqId = headers.get(REQID_HEADER);
  if (!reqId) {
    return { type: "empty" };
  }
  // Trim first, then validate
  const trimmedReqId = reqId.trim();
  if (trimmedReqId === "") {
    return { type: "empty" };
  }
  // Validate ReqId length (max 127 chars as per schema)
  if (trimmedReqId.length > REQID_MAX_LENGTH) {
    logger.warn("ReqId too long", { length: trimmedReqId.length, maxLength: REQID_MAX_LENGTH });
    return { type: "too_long", length: trimmedReqId.length };
  }
  // Validate ReqId contains only allowed characters
  if (!REQID_VALID_PATTERN.test(trimmedReqId)) {
    logger.warn("ReqId contains invalid characters", { reqId: trimmedReqId });
    return { type: "invalid_characters" };
  }
  return { type: "valid", value: trimmedReqId };
}

// =============================================================================
// Response Builders for Cache Hits
// =============================================================================

/**
 * Build OpenAI Chat Completion format response from cached completion
 */
export function buildOpenAIChatResponse(completion: Completion): Record<string, unknown> {
  return {
    id: `chatcmpl-cache-${completion.id}`,
    object: "chat.completion",
    created: Math.floor(completion.createdAt.getTime() / 1000),
    model: completion.model,
    choices: completion.completion.map((c, i) => ({
      index: i,
      message: {
        role: c.role || "assistant",
        content: c.content,
        tool_calls: c.tool_calls,
      },
      finish_reason: c.tool_calls?.length ? "tool_calls" : "stop",
    })),
    usage: {
      prompt_tokens: completion.promptTokens,
      completion_tokens: completion.completionTokens,
      total_tokens: completion.promptTokens + completion.completionTokens,
    },
  };
}

/**
 * Build Anthropic Messages format response from cached completion
 */
export function buildAnthropicResponse(completion: Completion): Record<string, unknown> {
  // Build content blocks including both text and tool_use
  const contentBlocks: Array<Record<string, unknown>> = [];
  for (const c of completion.completion) {
    // Add text content if present
    if (c.content) {
      contentBlocks.push({ type: "text", text: c.content });
    }
    // Add tool_use blocks if present
    if (c.tool_calls) {
      for (const tc of c.tool_calls) {
        contentBlocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || "{}"),
        });
      }
    }
  }
  // Determine stop_reason based on content
  const hasToolUse = contentBlocks.some((b) => b.type === "tool_use");
  return {
    id: `msg-cache-${completion.id}`,
    type: "message",
    role: "assistant",
    content: contentBlocks.length > 0 ? contentBlocks : [{ type: "text", text: "" }],
    model: completion.model,
    stop_reason: hasToolUse ? "tool_use" : "end_turn",
    usage: {
      input_tokens: completion.promptTokens,
      output_tokens: completion.completionTokens,
    },
  };
}

/**
 * Build OpenAI Responses API format response from cached completion
 */
export function buildOpenAIResponsesResponse(completion: Completion): Record<string, unknown> {
  // Build output items including both messages and function_call
  const outputItems: Array<Record<string, unknown>> = [];
  for (const c of completion.completion) {
    // Build content array for message
    const content: Array<Record<string, unknown>> = [];
    if (c.content) {
      content.push({ type: "output_text", text: c.content });
    }
    // Add message output item if there's text content
    if (content.length > 0) {
      outputItems.push({
        type: "message",
        role: c.role || "assistant",
        content,
      });
    }
    // Add function_call output items for tool_calls
    if (c.tool_calls) {
      for (const tc of c.tool_calls) {
        outputItems.push({
          type: "function_call",
          id: tc.id,
          call_id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments || "{}",
        });
      }
    }
  }
  return {
    id: `resp-cache-${completion.id}`,
    object: "response",
    created_at: Math.floor(completion.createdAt.getTime() / 1000),
    model: completion.model,
    output: outputItems.length > 0 ? outputItems : [{
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "" }],
    }],
    usage: {
      input_tokens: completion.promptTokens,
      output_tokens: completion.completionTokens,
      total_tokens: completion.promptTokens + completion.completionTokens,
    },
  };
}

/**
 * Build cached response based on API format
 */
export function buildCachedResponseByFormat(
  completion: Completion,
  format: ApiFormat,
): Record<string, unknown> {
  switch (format) {
    case "openai-chat":
      return buildOpenAIChatResponse(completion);
    case "anthropic":
      return buildAnthropicResponse(completion);
    case "openai-responses":
      return buildOpenAIResponsesResponse(completion);
  }
}

// =============================================================================
// Error Finalization Helper
// =============================================================================

/**
 * Context for ReqId request handling
 */
export interface ReqIdContext {
  reqId: string;
  apiKeyId: number;
  preCreatedCompletionId: number;
  apiFormat: ApiFormat;
}

/**
 * Finalize a pre-created completion on error
 *
 * Helper function to reduce duplication in error handling paths
 *
 * @param context - ReqId context (or null if no ReqId)
 * @param begin - Request start timestamp
 */
export async function finalizeReqIdOnError(
  context: ReqIdContext | null | undefined,
  begin: number,
): Promise<void> {
  if (!context) {
    return;
  }

  await finalizeReqId(context.apiKeyId, context.reqId, context.preCreatedCompletionId, {
    status: "failed",
    promptTokens: 0,
    completionTokens: 0,
    completion: [],
    ttft: -1,
    duration: Date.now() - begin,
  });
}

// =============================================================================
// Consolidated ReqId Handling Helpers
// =============================================================================

/**
 * Result of ReqId extraction and validation
 */
export type ReqIdExtractionResult =
  | { type: "valid"; reqId: string }
  | { type: "empty"; reqId: null }
  | { type: "error"; status: number; body: Record<string, unknown> };

/**
 * Extract, validate, and return ReqId with proper error responses
 *
 * Consolidates the extraction + validation + error response building pattern
 *
 * @param headers - Request headers
 * @param apiFormat - API format for error response formatting
 * @returns Extraction result with reqId or error response
 */
export function extractAndValidateReqId(
  headers: Headers,
  apiFormat: ApiFormat,
): ReqIdExtractionResult {
  const extraction = extractReqId(headers);

  if (extraction.type === "too_long" || extraction.type === "invalid_characters") {
    const errorResponse = buildReqIdValidationErrorResponse(extraction, apiFormat);
    return { type: "error", status: errorResponse.status, body: errorResponse.body };
  }

  if (extraction.type === "valid") {
    return { type: "valid", reqId: extraction.value };
  }

  return { type: "empty", reqId: null };
}

/**
 * Result of handling ReqId check result
 */
export type ReqIdHandleResult =
  | { type: "cache_hit"; response: Record<string, unknown> }
  | { type: "in_flight"; status: 409; retryAfter: number; response: Record<string, unknown> }
  | { type: "continue"; context: ReqIdContext | null };

/**
 * Handle ReqId check result - returns early response or context to continue
 *
 * Consolidates cache_hit handling, in_flight handling, and context building
 *
 * @param result - Result from checkReqId
 * @param reqId - The extracted reqId (or null)
 * @param apiKeyId - API key ID for the request
 * @param apiFormat - API format for response formatting
 * @returns Handle result indicating how to proceed
 */
export async function handleReqIdResult(
  result: ReqIdCheckResult,
  reqId: string | null,
  apiKeyId: number,
  apiFormat: ApiFormat,
): Promise<ReqIdHandleResult> {
  // Handle cache hit - return cached response
  if (result.type === "cache_hit") {
    const sourceCompletion = result.completion;

    // Record the cache hit (best-effort)
    try {
      await recordCacheHit(sourceCompletion, apiKeyId);
    } catch (error) {
      logger.warn("Failed to record cache hit", error);
    }

    // Return cached response if available, otherwise reconstruct
    const response = sourceCompletion.cachedResponse
      ? (sourceCompletion.cachedResponse.body as Record<string, unknown>)
      : buildCachedResponseByFormat(sourceCompletion, apiFormat);

    return { type: "cache_hit", response };
  }

  // Handle in-flight - return 409 Conflict
  if (result.type === "in_flight") {
    if (!reqId) {
      throw new Error("Invariant violated: reqId is null for in_flight result");
    }

    return {
      type: "in_flight",
      status: 409,
      retryAfter: result.retryAfter,
      response: buildInFlightErrorResponse(reqId, result.inFlight, result.retryAfter, apiFormat),
    };
  }

  // Build context for new_request or no_reqid
  const context: ReqIdContext | null = (result.type === "new_request" && reqId)
    ? {
        reqId,
        apiKeyId,
        preCreatedCompletionId: result.completionId,
        apiFormat,
      }
    : null;

  return { type: "continue", context };
}

// =============================================================================
// ReqId Validation Error Responses
// =============================================================================

/**
 * Build error response for invalid ReqId (too long or invalid characters)
 */
function buildReqIdValidationErrorResponse(
  extraction: ExtractReqIdResult,
  format: ApiFormat,
): { status: number; body: Record<string, unknown> } {
  if (extraction.type === "too_long") {
    const message = `X-NexusGate-ReqId exceeds maximum length of ${REQID_MAX_LENGTH} characters (got ${extraction.length})`;
    return {
      status: 400,
      body: buildValidationErrorBody(message, "reqid_too_long", format),
    };
  }

  if (extraction.type === "invalid_characters") {
    const message = "X-NexusGate-ReqId contains invalid characters. Only alphanumeric characters, hyphens, underscores, dots, colons, and forward slashes are allowed.";
    return {
      status: 400,
      body: buildValidationErrorBody(message, "reqid_invalid_characters", format),
    };
  }

  // Should not reach here, but provide a fallback
  return {
    status: 400,
    body: buildValidationErrorBody("Invalid X-NexusGate-ReqId", "reqid_invalid", format),
  };
}

/**
 * Build validation error body in the appropriate format
 */
function buildValidationErrorBody(
  message: string,
  code: string,
  format: ApiFormat,
): Record<string, unknown> {
  if (format === "anthropic") {
    return {
      type: "error",
      error: {
        type: "invalid_request_error",
        message,
      },
    };
  }

  if (format === "openai-responses") {
    return {
      object: "error",
      error: {
        type: "invalid_request_error",
        message,
        code,
      },
    };
  }

  // openai-chat format
  return {
    error: {
      message,
      type: "invalid_request_error",
      code,
    },
  };
}
