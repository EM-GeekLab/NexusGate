/**
 * Redis-based In-Flight request tracking for ReqId deduplication
 *
 * Tracks requests that are currently being processed to prevent duplicate
 * concurrent requests with the same ReqId.
 */

import { createLogger } from "@/utils/logger";
import { redisClient } from "./redisClient";

const logger = createLogger("reqIdCache");

/**
 * In-flight request data stored in Redis
 */
export interface InFlightRequest {
  completionId: number;
  startTime: number; // Unix timestamp in milliseconds
  isStream: boolean;
  endpoint: string;
}

// Redis key prefix for in-flight requests
const KEY_PREFIX = "reqid:inflight";

// TTL for in-flight markers (10 minutes)
// This prevents orphan keys if the server crashes during request processing
const IN_FLIGHT_TTL_SECONDS = 600;

// Estimated request durations for Retry-After calculation
const ESTIMATED_STREAM_DURATION_MS = 60000; // 60 seconds for streaming
const ESTIMATED_NON_STREAM_DURATION_MS = 30000; // 30 seconds for non-streaming

/**
 * Build the Redis key for an in-flight request
 */
function buildKey(apiKeyId: number, reqId: string): string {
  return `${KEY_PREFIX}:${apiKeyId}:${reqId}`;
}

/**
 * Mark a request as in-flight (atomically using SETNX)
 *
 * @param apiKeyId - The API key ID
 * @param reqId - The client-provided request ID
 * @param completionId - The database completion ID
 * @param endpoint - The API endpoint being called
 * @param isStream - Whether this is a streaming request
 * @returns true if successfully marked (request is new), false if already in-flight
 */
export async function markInFlight(
  apiKeyId: number,
  reqId: string,
  completionId: number,
  endpoint: string,
  isStream: boolean,
): Promise<boolean> {
  const key = buildKey(apiKeyId, reqId);
  const data: InFlightRequest = {
    completionId,
    startTime: Date.now(),
    isStream,
    endpoint,
  };

  try {
    const success = await redisClient.setnx(
      key,
      JSON.stringify(data),
      IN_FLIGHT_TTL_SECONDS,
    );

    if (success) {
      logger.debug("Marked request as in-flight", { apiKeyId, reqId, completionId });
    } else {
      logger.debug("Request already in-flight", { apiKeyId, reqId });
    }

    return success;
  } catch (error) {
    logger.error("Failed to mark request as in-flight", error);
    // Return false to be safe - treat as if already in-flight
    return false;
  }
}

/**
 * Get in-flight request data
 *
 * @param apiKeyId - The API key ID
 * @param reqId - The client-provided request ID
 * @returns The in-flight request data, or null if not in-flight
 */
export async function getInFlight(
  apiKeyId: number,
  reqId: string,
): Promise<InFlightRequest | null> {
  const key = buildKey(apiKeyId, reqId);

  try {
    const data = await redisClient.get(key);
    if (!data) {
      return null;
    }

    return JSON.parse(data) as InFlightRequest;
  } catch (error) {
    logger.error("Failed to get in-flight request", error);
    return null;
  }
}

/**
 * Clear the in-flight marker for a request
 *
 * Should be called when a request completes (successfully or with error)
 *
 * @param apiKeyId - The API key ID
 * @param reqId - The client-provided request ID
 */
export async function clearInFlight(
  apiKeyId: number,
  reqId: string,
): Promise<void> {
  const key = buildKey(apiKeyId, reqId);

  try {
    await redisClient.del(key);
    logger.debug("Cleared in-flight marker", { apiKeyId, reqId });
  } catch (error) {
    logger.error("Failed to clear in-flight marker", error);
    // Non-critical - the TTL will eventually expire the key
  }
}

/**
 * Calculate the recommended Retry-After value based on in-flight request state
 *
 * @param inFlight - The in-flight request data
 * @returns Retry-After value in seconds (minimum 1)
 */
export function calculateRetryAfter(inFlight: InFlightRequest): number {
  const elapsed = Date.now() - inFlight.startTime;
  const estimatedTotal = inFlight.isStream
    ? ESTIMATED_STREAM_DURATION_MS
    : ESTIMATED_NON_STREAM_DURATION_MS;

  const remainingMs = Math.max(estimatedTotal - elapsed, 1000);
  return Math.ceil(remainingMs / 1000);
}

/**
 * Check if Redis is available for in-flight tracking
 *
 * @returns true if Redis is connected and ready
 */
export function isRedisAvailable(): boolean {
  return redisClient.isConnected();
}
