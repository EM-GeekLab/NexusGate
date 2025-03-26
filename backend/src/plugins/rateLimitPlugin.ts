import { consume, type TokenBucketOptions } from "@/utils/tokenBucket";
import consola from "consola";
import { Elysia, t } from "elysia";
import { DEFAULT_RATE_LIMIT, DEFAULT_REFILL_RATE } from "@/utils/config";
import { apiKeyPlugin } from "./apiKeyPlugin";

const logger = consola.withTag("rateLimitPlugin");

export const rateLimitPlugin = new Elysia({
  name: "rateLimitPlugin",
})
  .use(apiKeyPlugin)
  .macro({
    rateLimit: (options?: {
      limit?: number;
      refill?: number;
      identifier?: (body?: unknown) => string;
    }) => ({
      async beforeHandle({ error, set, bearer, body}) {
        const limit = options?.limit ?? DEFAULT_RATE_LIMIT;
        const refill = options?.refill ?? DEFAULT_REFILL_RATE;
        if (Number.isNaN(limit) || Number.isNaN(refill)) {
          return error(500, "Invalid rate limit configuration");
        }

        let identifier = "default";
        if (options?.identifier) {
          try {
            identifier = options.identifier(body);
          } catch (err) {
            logger.error("Error getting identifier from body", err);
          }
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

        logger.debug(`Rate limit(${opt.identifier}:${opt.apikey}): ${newTokens}/${limit}`);
        
        set.headers['X-RateLimit-Limit'] = limit;
        set.headers['X-RateLimit-Remaining'] = newTokens;
      },
    }),
  });
