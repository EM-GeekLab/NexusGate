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
 * Lua script for atomic token bucket refill and consume operation.
 * This prevents race conditions in concurrent requests.
 *
 * KEYS[1]: tokens key
 * KEYS[2]: timestamp key
 * ARGV[1]: limit (base rate limit)
 * ARGV[2]: current timestamp in ms
 * ARGV[3]: tokens to consume (0 for read-only check)
 * ARGV[4]: key expiry in seconds
 * ARGV[5]: burst multiplier
 *
 * Returns: [remaining_tokens, was_allowed (1 or 0)]
 */
const TOKEN_BUCKET_SCRIPT = `
local tokens_key = KEYS[1]
local ts_key = KEYS[2]
local limit = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local consume = tonumber(ARGV[3])
local expiry = tonumber(ARGV[4])
local burst_mult = tonumber(ARGV[5])

local capacity = limit * burst_mult
local refill_rate = limit / 60.0

local tokens = tonumber(redis.call('GET', tokens_key))
local last_refill = tonumber(redis.call('GET', ts_key))

if tokens == nil or last_refill == nil then
  -- Initialize bucket with full capacity
  tokens = capacity
  last_refill = now
else
  -- Refill tokens based on elapsed time
  local elapsed = (now - last_refill) / 1000.0
  local tokens_to_add = elapsed * refill_rate
  tokens = math.min(capacity, tokens + tokens_to_add)
end

local allowed = 0
if consume > 0 then
  if tokens >= consume then
    tokens = tokens - consume
    allowed = 1
  end
else
  -- Read-only check: allowed if any tokens available
  if tokens > 0 then
    allowed = 1
  end
end

-- Update Redis
redis.call('SET', tokens_key, tokens, 'EX', expiry)
redis.call('SET', ts_key, now, 'EX', expiry)

return {tokens, allowed}
`;

/**
 * Execute token bucket operation atomically using Lua script
 */
async function executeTokenBucket(
  tokensKey: string,
  timestampKey: string,
  limit: number,
  tokensToConsume: number,
): Promise<{ tokens: number; allowed: boolean }> {
  const now = Date.now();

  const result = (await redisClient.eval(TOKEN_BUCKET_SCRIPT, {
    keys: [tokensKey, timestampKey],
    arguments: [
      limit.toString(),
      now.toString(),
      tokensToConsume.toString(),
      KEY_EXPIRY.toString(),
      BURST_MULTIPLIER.toString(),
    ],
  })) as [number, number];

  return {
    tokens: result[0],
    allowed: result[1] === 1,
  };
}

/**
 * Check RPM limit before request (pre-flight check)
 * Consumes 1 token if allowed (atomic operation)
 * Returns true if allowed, false if rate limited
 */
export async function checkRpmLimit(
  apiKeyId: number,
  rpmLimit: number,
): Promise<{ allowed: boolean; remaining: number }> {
  if (rpmLimit <= 0) {
    // Invalid limit, fail open
    return { allowed: true, remaining: 0 };
  }

  const { rpmTokensKey, rpmTimestampKey } = getKeys(apiKeyId);

  try {
    const { tokens, allowed } = await executeTokenBucket(
      rpmTokensKey,
      rpmTimestampKey,
      rpmLimit,
      1, // Consume 1 token for RPM
    );

    return { allowed, remaining: Math.floor(tokens) };
  } catch (error) {
    logger.error("RPM check error:", error);
    // Fail open - allow request on error
    return { allowed: true, remaining: rpmLimit };
  }
}

/**
 * Check TPM limit before request (pre-flight check)
 * Only checks if there are tokens available, does NOT consume (atomic read)
 * Token consumption happens after request completion
 */
export async function checkTpmLimit(
  apiKeyId: number,
  tpmLimit: number,
): Promise<{ allowed: boolean; remaining: number }> {
  if (tpmLimit <= 0) {
    // Invalid limit, fail open
    return { allowed: true, remaining: 0 };
  }

  const { tpmTokensKey, tpmTimestampKey } = getKeys(apiKeyId);

  try {
    const { tokens, allowed } = await executeTokenBucket(
      tpmTokensKey,
      tpmTimestampKey,
      tpmLimit,
      0, // Don't consume, just check
    );

    return { allowed, remaining: Math.floor(tokens) };
  } catch (error) {
    logger.error("TPM check error:", error);
    return { allowed: true, remaining: tpmLimit };
  }
}

/**
 * Lua script for consuming tokens after request completion.
 * This is a separate operation because we don't know the token count until after the request.
 *
 * KEYS[1]: tokens key
 * KEYS[2]: timestamp key
 * ARGV[1]: limit (base rate limit)
 * ARGV[2]: current timestamp in ms
 * ARGV[3]: tokens to consume
 * ARGV[4]: key expiry in seconds
 * ARGV[5]: burst multiplier
 *
 * Returns: remaining tokens after consumption
 */
const CONSUME_TOKENS_SCRIPT = `
local tokens_key = KEYS[1]
local ts_key = KEYS[2]
local limit = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local consume = tonumber(ARGV[3])
local expiry = tonumber(ARGV[4])
local burst_mult = tonumber(ARGV[5])

local capacity = limit * burst_mult
local refill_rate = limit / 60.0

local tokens = tonumber(redis.call('GET', tokens_key))
local last_refill = tonumber(redis.call('GET', ts_key))

if tokens == nil or last_refill == nil then
  -- Initialize bucket with full capacity
  tokens = capacity
  last_refill = now
else
  -- Refill tokens based on elapsed time
  local elapsed = (now - last_refill) / 1000.0
  local tokens_to_add = elapsed * refill_rate
  tokens = math.min(capacity, tokens + tokens_to_add)
end

-- Consume tokens (allow going negative for tracking)
tokens = math.max(0, tokens - consume)

-- Update Redis
redis.call('SET', tokens_key, tokens, 'EX', expiry)
redis.call('SET', ts_key, now, 'EX', expiry)

return tokens
`;

/**
 * Consume tokens after request completion (post-flight)
 * Used for TPM after knowing actual token usage
 */
export async function consumeTokens(
  apiKeyId: number,
  tpmLimit: number,
  tokensUsed: number,
): Promise<void> {
  if (tpmLimit <= 0 || tokensUsed <= 0) {
    return;
  }

  const { tpmTokensKey, tpmTimestampKey } = getKeys(apiKeyId);
  const now = Date.now();

  try {
    const remaining = (await redisClient.eval(CONSUME_TOKENS_SCRIPT, {
      keys: [tpmTokensKey, tpmTimestampKey],
      arguments: [
        tpmLimit.toString(),
        now.toString(),
        tokensUsed.toString(),
        KEY_EXPIRY.toString(),
        BURST_MULTIPLIER.toString(),
      ],
    })) as number;

    logger.debug(
      `Consumed ${tokensUsed} tokens for API key ${apiKeyId}, remaining: ${remaining}`,
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
    // Use atomic reads to get current token counts
    const [rpmResult, tpmResult] = await Promise.all([
      executeTokenBucket(rpmTokensKey, rpmTimestampKey, config.rpmLimit, 0),
      executeTokenBucket(tpmTokensKey, tpmTimestampKey, config.tpmLimit, 0),
    ]);

    const rpmCapacity = config.rpmLimit * BURST_MULTIPLIER;
    const tpmCapacity = config.tpmLimit * BURST_MULTIPLIER;

    // Calculate usage relative to base limit for clearer display
    // remaining is capped at limit (not burst capacity) for UI simplicity
    const rpmUsed = Math.max(0, rpmCapacity - rpmResult.tokens);
    const tpmUsed = Math.max(0, tpmCapacity - tpmResult.tokens);

    return {
      rpm: {
        current: Math.floor(rpmUsed),
        limit: config.rpmLimit,
        remaining: Math.max(
          0,
          Math.floor(Math.min(rpmResult.tokens, config.rpmLimit)),
        ),
      },
      tpm: {
        current: Math.floor(tpmUsed),
        limit: config.tpmLimit,
        remaining: Math.max(
          0,
          Math.floor(Math.min(tpmResult.tokens, config.tpmLimit)),
        ),
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
