import { consume, type TokenBucketOptions } from "@/utils/tokenBucket";
import { DEFAULT_RATE_LIMIT_CONFIG, getRateLimitConfig } from "../utils/rateLimitConfig";
import { consola } from "consola";
import { Elysia } from "elysia";
import { apiKeyPlugin } from "./apiKeyPlugin";

const logger = consola.withTag("rateLimitPlugin");

export const rateLimitPlugin = new Elysia({
  name: "rateLimitPlugin",
})
  .use(apiKeyPlugin)
  .macro({
    rateLimit: (options?: {
      identifier?: (body?: unknown) => string;
      customConfig?: {
        limit?: number;
        refill?: number;
      };
    }) => ({
      async beforeHandle({ error, set, bearer, body}) {
        let identifier = "default";
        if (options?.identifier) {
          try {
            identifier = options.identifier(body);
                      } catch (err) {
            logger.error("Error getting identifier from body", err);
          }
        }
        
        const config = getRateLimitConfig(identifier) ?? DEFAULT_RATE_LIMIT_CONFIG;
        
        const limit = options?.customConfig?.limit ?? config.limit;
        const refill = options?.customConfig?.refill ?? config.refill;
        
        if (Number.isNaN(limit) || Number.isNaN(refill)) {
          return error(500, "Invalid rate limit configuration");
        }

        const opt = {
          capacity: limit,
          refillRate: refill,
          identifier: identifier,
          apikey: bearer,
        } as TokenBucketOptions;
        
        const newTokens = await consume(opt, 1);
        if (newTokens === false) {
          return error(429, "Rate limit exceeded");
        }

        logger.debug(`Rate limit (${identifier}:${bearer}): ${newTokens}/${limit}`);
        
        set.headers['X-RateLimit-Limit'] = limit.toString();
        set.headers['X-RateLimit-Remaining'] = newTokens.toString();
      },
    }),
  });
