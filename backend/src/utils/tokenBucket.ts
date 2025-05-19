import redisClient from "./redisClient";
import { consola } from "consola";

const logger = consola.withTag("tokenBucket");

export type TokenBucketOptions = {
  capacity: number;
  refillRate: number;
  identifier: string;
  apiKeySpecific?: boolean;
  apiKey: string;
};

const KEY_PREFIX = "token_bucket";
const EXPIRY_TIME = 3600;

function getKey(options: TokenBucketOptions): string {
  if (options.apiKeySpecific) {
    return `${KEY_PREFIX}:${options.identifier}:${options.apiKey}`;
  }
  return `${KEY_PREFIX}:${options.identifier}`;
}

async function refill(
  options: TokenBucketOptions,
): Promise<{ tokens: number; lastRefill: number }> {
  const key = getKey(options);
  const now = Date.now();

  try {
    const tokensStr = await redisClient.get(`${key}:tokens`);
    const lastRefillStr = await redisClient.get(`${key}:lastRefill`);

    if (!tokensStr || !lastRefillStr) {
      await redisClient.set(`${key}:tokens`, options.capacity, { EX: EXPIRY_TIME });
      await redisClient.set(`${key}:lastRefill`, now, { EX: EXPIRY_TIME });
      return { tokens: options.capacity, lastRefill: now };
    }

    const currentTokens = tokensStr ? Number.parseFloat(tokensStr) : options.capacity;
    const lastRefill = lastRefillStr ? Number.parseInt(lastRefillStr) : now;
    const elapsed = (now - lastRefill) / 1000;
    const tokensToAdd = Math.floor(elapsed * options.refillRate);
    const newTokens = Math.min(options.capacity, currentTokens + tokensToAdd);

    if (tokensToAdd > 0) {
      await redisClient.set(`${key}:tokens`, newTokens, { EX: EXPIRY_TIME });
      await redisClient.set(`${key}:lastRefill`, now, { EX: EXPIRY_TIME });
    }

    return { tokens: newTokens, lastRefill: now };
  } catch (error) {
    logger.error(`Redis refill error: ${(error as Error).message}`);
    return { tokens: options.capacity, lastRefill: now };
  }
}

export async function consume(
  options: TokenBucketOptions,
  tokens: number,
): Promise<number | false> {
  const key = getKey(options);

  try {
    const { tokens: currentTokens } = await refill(options);

    if (tokens <= currentTokens) {
      const newTokens = currentTokens - tokens;
      await redisClient.set(`${key}:tokens`, newTokens, { EX: EXPIRY_TIME });
      return newTokens;
    }

    return false;
  } catch (error) {
    logger.error(`Redis consume error: ${(error as Error).message}`);
    return false;
  }
}
