import { consola } from "consola";
import { redisClient } from "./redisClient";

const logger = consola.withTag("apiKeyRateLimit");

// Constants
const KEY_PREFIX = "api_key_rate_limit";
const WINDOW_SECONDS = 60; // 1 minute window
const BURST_MULTIPLIER = 3; // Burst capacity = limit * 3
const KEY_EXPIRY = WINDOW_SECONDS * 2; // Redis key expiry time

export interface RateLimitConfig {
  rpmLimit: number;
  tpmLimit: number;
}

export interface RateLimitStatus {
  rpm: {
    current: number;
    limit: number;
    remaining: number;
  };
  tpm: {
    current: number;
    limit: number;
    remaining: number;
  };
}

/**
 * Get Redis keys for rate limiting
 */
function getKeys(apiKeyId: number): {
  rpmTokensKey: string;
  rpmTimestampKey: string;
  tpmTokensKey: string;
  tpmTimestampKey: string;
} {
  return {
    rpmTokensKey: `${KEY_PREFIX}:${apiKeyId}:rpm:tokens`,
    rpmTimestampKey: `${KEY_PREFIX}:${apiKeyId}:rpm:ts`,
    tpmTokensKey: `${KEY_PREFIX}:${apiKeyId}:tpm:tokens`,
    tpmTimestampKey: `${KEY_PREFIX}:${apiKeyId}:tpm:ts`,
  };
}

/**
 * Token bucket refill logic with burst support
 * Returns the current number of available tokens after refill
 */
async function refillBucket(
  tokensKey: string,
  timestampKey: string,
  limit: number,
): Promise<number> {
  const now = Date.now();
  const capacity = limit * BURST_MULTIPLIER;
  const refillRate = limit / 60; // tokens per second

  const [tokensStr, lastRefillStr] = await Promise.all([
    redisClient.get(tokensKey),
    redisClient.get(timestampKey),
  ]);

  if (!tokensStr || !lastRefillStr) {
    // Initialize bucket with full capacity
    await Promise.all([
      redisClient.set(tokensKey, capacity, { EX: KEY_EXPIRY }),
      redisClient.set(timestampKey, now, { EX: KEY_EXPIRY }),
    ]);
    return capacity;
  }

  const currentTokens = Number.parseFloat(tokensStr);
  const lastRefill = Number.parseInt(lastRefillStr);
  const elapsed = (now - lastRefill) / 1000;
  const tokensToAdd = elapsed * refillRate;
  const newTokens = Math.min(capacity, currentTokens + tokensToAdd);

  if (tokensToAdd > 0) {
    await Promise.all([
      redisClient.set(tokensKey, newTokens, { EX: KEY_EXPIRY }),
      redisClient.set(timestampKey, now, { EX: KEY_EXPIRY }),
    ]);
  }

  return newTokens;
}

/**
 * Check RPM limit before request (pre-flight check)
 * Consumes 1 token if allowed
 * Returns true if allowed, false if rate limited
 */
export async function checkRpmLimit(
  apiKeyId: number,
  rpmLimit: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const { rpmTokensKey, rpmTimestampKey } = getKeys(apiKeyId);

  try {
    const tokens = await refillBucket(rpmTokensKey, rpmTimestampKey, rpmLimit);

    if (tokens >= 1) {
      // Consume one request token
      const remaining = tokens - 1;
      await redisClient.set(rpmTokensKey, remaining, { EX: KEY_EXPIRY });
      return { allowed: true, remaining: Math.floor(remaining) };
    }

    return { allowed: false, remaining: 0 };
  } catch (error) {
    logger.error("RPM check error:", error);
    // Fail open - allow request on error
    return { allowed: true, remaining: rpmLimit };
  }
}

/**
 * Check TPM limit before request (pre-flight check)
 * Only checks if there are tokens available, does NOT consume
 * Token consumption happens after request completion
 */
export async function checkTpmLimit(
  apiKeyId: number,
  tpmLimit: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const { tpmTokensKey, tpmTimestampKey } = getKeys(apiKeyId);

  try {
    const tokens = await refillBucket(tpmTokensKey, tpmTimestampKey, tpmLimit);

    // For pre-flight, we just check if there are tokens available
    // We don't consume tokens until after the request completes
    if (tokens > 0) {
      return { allowed: true, remaining: Math.floor(tokens) };
    }

    return { allowed: false, remaining: 0 };
  } catch (error) {
    logger.error("TPM check error:", error);
    return { allowed: true, remaining: tpmLimit };
  }
}

/**
 * Consume tokens after request completion (post-flight)
 * Used for TPM after knowing actual token usage
 */
export async function consumeTokens(
  apiKeyId: number,
  tpmLimit: number,
  tokensUsed: number,
): Promise<void> {
  const { tpmTokensKey, tpmTimestampKey } = getKeys(apiKeyId);

  try {
    const tokens = await refillBucket(tpmTokensKey, tpmTimestampKey, tpmLimit);
    const newTokens = Math.max(0, tokens - tokensUsed);
    await redisClient.set(tpmTokensKey, newTokens, { EX: KEY_EXPIRY });

    logger.debug(
      `Consumed ${tokensUsed} tokens for API key ${apiKeyId}, remaining: ${newTokens}`,
    );
  } catch (error) {
    logger.error("Token consumption error:", error);
  }
}

/**
 * Get current rate limit status for an API key
 * Used for displaying usage statistics in the frontend
 */
export async function getRateLimitStatus(
  apiKeyId: number,
  config: RateLimitConfig,
): Promise<RateLimitStatus> {
  const { rpmTokensKey, rpmTimestampKey, tpmTokensKey, tpmTimestampKey } =
    getKeys(apiKeyId);

  try {
    const [rpmTokens, tpmTokens] = await Promise.all([
      refillBucket(rpmTokensKey, rpmTimestampKey, config.rpmLimit),
      refillBucket(tpmTokensKey, tpmTimestampKey, config.tpmLimit),
    ]);

    const rpmCapacity = config.rpmLimit * BURST_MULTIPLIER;
    const tpmCapacity = config.tpmLimit * BURST_MULTIPLIER;

    return {
      rpm: {
        current: Math.floor(rpmCapacity - rpmTokens),
        limit: config.rpmLimit,
        remaining: Math.floor(rpmTokens),
      },
      tpm: {
        current: Math.floor(tpmCapacity - tpmTokens),
        limit: config.tpmLimit,
        remaining: Math.floor(tpmTokens),
      },
    };
  } catch (error) {
    logger.error("Get rate limit status error:", error);
    return {
      rpm: { current: 0, limit: config.rpmLimit, remaining: config.rpmLimit },
      tpm: { current: 0, limit: config.tpmLimit, remaining: config.tpmLimit },
    };
  }
}
