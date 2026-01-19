/**
 * Failover Service
 *
 * Provides automatic failover and retry capabilities for upstream requests.
 * When a request to one provider fails with a retriable error, it automatically
 * tries the next available provider.
 */

import { consola } from "consola";
import type { ModelWithProvider } from "@/adapters/types";

const logger = consola.withTag("failover");

// =============================================================================
// Configuration Types
// =============================================================================

export interface FailoverConfig {
  /** Maximum number of different providers to try (default: 3) */
  maxProviderAttempts: number;
  /** Maximum retries on the same provider for transient errors like 429 (default: 1) */
  sameProviderRetries: number;
  /** HTTP status codes that should trigger a retry (default: [429, 500, 502, 503, 504]) */
  retriableStatusCodes: number[];
  /** Network error codes that should trigger a retry */
  retriableErrorCodes: string[];
  /** Base delay in ms for exponential backoff (default: 100) */
  baseDelayMs: number;
  /** Maximum delay in ms for exponential backoff (default: 5000) */
  maxDelayMs: number;
  /** Exponential base for backoff calculation (default: 2) */
  exponentialBase: number;
  /** Jitter factor to add randomness to delays (default: 0.1) */
  jitterFactor: number;
  /** Request timeout in ms (default: 60000) */
  timeoutMs: number;
}

export const DEFAULT_FAILOVER_CONFIG: FailoverConfig = {
  maxProviderAttempts: 3,
  sameProviderRetries: 1,
  retriableStatusCodes: [429, 500, 502, 503, 504],
  retriableErrorCodes: [
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "EPIPE",
    "UND_ERR_CONNECT_TIMEOUT",
  ],
  baseDelayMs: 100,
  maxDelayMs: 5000,
  exponentialBase: 2,
  jitterFactor: 0.1,
  timeoutMs: 60000,
};

// =============================================================================
// Error Types
// =============================================================================

export interface FailoverError {
  providerId: number;
  providerName: string;
  attempt: number;
  error: string;
  statusCode?: number;
  retriable: boolean;
  timestamp: number;
}

export interface FailoverResult<T> {
  success: boolean;
  response?: T;
  provider?: ModelWithProvider;
  errors: FailoverError[];
  totalAttempts: number;
  finalError?: string;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  config: FailoverConfig,
): number {
  const exponentialDelay =
    config.baseDelayMs * Math.pow(config.exponentialBase, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = cappedDelay * config.jitterFactor * Math.random();
  return Math.floor(cappedDelay + jitter);
}

/**
 * Check if an HTTP status code is retriable
 */
export function isRetriableStatusCode(
  statusCode: number,
  config: FailoverConfig,
): boolean {
  return config.retriableStatusCodes.includes(statusCode);
}

/**
 * Check if a network error is retriable
 */
export function isRetriableNetworkError(
  error: Error,
  config: FailoverConfig,
): boolean {
  const errorCode = (error as NodeJS.ErrnoException).code;
  if (errorCode && config.retriableErrorCodes.includes(errorCode)) {
    return true;
  }
  // Handle AbortController timeout errors (AbortError)
  if (error.name === "AbortError") {
    return true;
  }
  // Check error message for specific transient network issues
  // Use specific phrases to avoid false positives (e.g., "invalid network configuration")
  const message = error.message.toLowerCase();
  return (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("the operation was aborted") ||
    message.includes("connection reset") ||
    message.includes("connection refused") ||
    message.includes("network error") ||
    message.includes("network request failed") ||
    message.includes("socket hang up") ||
    message.includes("fetch failed")
  );
}

/**
 * Sleep for a given number of milliseconds
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout support
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// =============================================================================
// Failover Execution Engine
// =============================================================================

export interface RequestBuilder {
  (provider: ModelWithProvider): { url: string; init: RequestInit };
}

/**
 * Execute a request with automatic failover across multiple providers
 *
 * @param candidates - List of model/provider combinations to try
 * @param buildRequest - Function to build the request for a given provider
 * @param config - Failover configuration (optional, uses defaults if not provided)
 * @returns FailoverResult with the response or accumulated errors
 */
export async function executeWithFailover(
  candidates: ModelWithProvider[],
  buildRequest: RequestBuilder,
  config: Partial<FailoverConfig> = {},
): Promise<FailoverResult<Response>> {
  const cfg: FailoverConfig = { ...DEFAULT_FAILOVER_CONFIG, ...config };
  const errors: FailoverError[] = [];
  let totalAttempts = 0;

  // Limit candidates to maxProviderAttempts and iterate in order
  // candidates are already unique and ordered by selectMultipleCandidates
  const providersToTry = candidates.slice(0, cfg.maxProviderAttempts);

  for (const [providerIndex, provider] of providersToTry.entries()) {
    const { url, init } = buildRequest(provider);

    // Try this provider with same-provider retries for transient errors
    for (
      let sameProviderAttempt = 0;
      sameProviderAttempt <= cfg.sameProviderRetries;
      sameProviderAttempt++
    ) {
      totalAttempts++;

      // Add delay for retries (not for first attempt)
      if (sameProviderAttempt > 0 || providerIndex > 0) {
        const delay = calculateBackoffDelay(totalAttempts - 1, cfg);
        logger.debug("Waiting before retry", {
          delay,
          attempt: totalAttempts,
          provider: provider.provider.name,
        });
        await sleep(delay);
      }

      try {
        logger.debug("Attempting request", {
          provider: provider.provider.name,
          providerId: provider.provider.id,
          attempt: totalAttempts,
          sameProviderAttempt,
          url,
        });

        const response = await fetchWithTimeout(url, init, cfg.timeoutMs);

        // Success - return immediately
        if (response.ok) {
          logger.debug("Request succeeded", {
            provider: provider.provider.name,
            attempt: totalAttempts,
            status: response.status,
          });
          return {
            success: true,
            response,
            provider,
            errors,
            totalAttempts,
          };
        }

        // Check if status code is retriable
        const retriable = isRetriableStatusCode(response.status, cfg);
        const errorMsg = `HTTP ${response.status}`;

        errors.push({
          providerId: provider.provider.id,
          providerName: provider.provider.name,
          attempt: totalAttempts,
          error: errorMsg,
          statusCode: response.status,
          retriable,
          timestamp: Date.now(),
        });

        logger.warn("Request failed with HTTP error", {
          provider: provider.provider.name,
          status: response.status,
          retriable,
          attempt: totalAttempts,
        });

        // If not retriable, return the response (let caller handle the error)
        if (!retriable) {
          return {
            success: false,
            response,
            provider,
            errors,
            totalAttempts,
            finalError: errorMsg,
          };
        }

        // If retriable but we've exhausted same-provider retries, move to next provider
        if (sameProviderAttempt >= cfg.sameProviderRetries) {
          logger.debug("Exhausted same-provider retries, trying next provider");
          break;
        }

        // Otherwise, continue with same-provider retry
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        const retriable = isRetriableNetworkError(err, cfg);

        errors.push({
          providerId: provider.provider.id,
          providerName: provider.provider.name,
          attempt: totalAttempts,
          error: err.message,
          retriable,
          timestamp: Date.now(),
        });

        logger.warn("Request failed with network error", {
          provider: provider.provider.name,
          error: err.message,
          retriable,
          attempt: totalAttempts,
        });

        // If not retriable, throw immediately
        if (!retriable) {
          return {
            success: false,
            errors,
            totalAttempts,
            finalError: err.message,
          };
        }

        // If retriable but we've exhausted same-provider retries, move to next provider
        if (sameProviderAttempt >= cfg.sameProviderRetries) {
          logger.debug("Exhausted same-provider retries, trying next provider");
          break;
        }
      }
    }
  }

  // All providers exhausted
  const lastError = errors[errors.length - 1];
  logger.error("All providers exhausted", {
    totalAttempts,
    providersAttempted: providersToTry.length,
    errors: errors.map((e) => ({
      provider: e.providerName,
      error: e.error,
      statusCode: e.statusCode,
    })),
  });

  return {
    success: false,
    errors,
    totalAttempts,
    finalError: lastError?.error || "All providers exhausted",
  };
}

/**
 * Reorder candidates to put a specific provider first (if available)
 * while maintaining weighted random order for the rest
 */
export function reorderCandidatesWithPreferred(
  candidates: ModelWithProvider[],
  preferredProviderId?: number,
): ModelWithProvider[] {
  if (!preferredProviderId || candidates.length <= 1) {
    return candidates;
  }

  const preferred = candidates.find(
    (c) => c.provider.id === preferredProviderId,
  );
  if (!preferred) {
    return candidates;
  }

  const others = candidates.filter((c) => c.provider.id !== preferredProviderId);
  return [preferred, ...others];
}

/**
 * Select multiple candidates using weighted random selection
 * Returns candidates in order of selection (first selected = highest priority)
 */
export function selectMultipleCandidates(
  candidates: ModelWithProvider[],
  count: number,
): ModelWithProvider[] {
  if (candidates.length <= count) {
    return [...candidates];
  }

  const result: ModelWithProvider[] = [];
  const remaining = [...candidates];
  // Calculate total weight once and update incrementally
  let totalWeight = remaining.reduce((sum, c) => sum + c.model.weight, 0);

  for (let i = 0; i < count && remaining.length > 0; i++) {
    const random = Math.random() * totalWeight;

    let cumulative = 0;
    // Default to the last element as a fallback for floating point edge cases
    let selectedIndex = remaining.length - 1;
    for (let j = 0; j < remaining.length; j++) {
      const item = remaining[j];
      if (item) {
        cumulative += item.model.weight;
        if (random < cumulative) {
          selectedIndex = j;
          break;
        }
      }
    }

    const [selected] = remaining.splice(selectedIndex, 1);
    if (selected) {
      result.push(selected);
      totalWeight -= selected.model.weight;
    }
  }

  return result;
}
