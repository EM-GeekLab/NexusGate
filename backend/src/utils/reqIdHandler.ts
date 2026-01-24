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
 * Extract ReqId from request headers
 *
 * @param headers - Request headers
 * @returns The ReqId value or null if not present
 */
export function extractReqId(headers: Headers): string | null {
  const reqId = headers.get(REQID_HEADER);
  if (!reqId) {
    return null;
  }
  // Trim first, then validate
  const trimmedReqId = reqId.trim();
  if (trimmedReqId === "") {
    return null;
  }
  // Validate ReqId length (max 127 chars as per schema)
  if (trimmedReqId.length > 127) {
    logger.warn("ReqId too long, truncating", { length: trimmedReqId.length });
    return trimmedReqId.substring(0, 127);
  }
  return trimmedReqId;
}
