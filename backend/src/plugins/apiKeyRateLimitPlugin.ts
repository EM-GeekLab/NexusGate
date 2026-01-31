import { Elysia } from "elysia";
import { checkRpmLimit, checkTpmLimit } from "@/utils/apiKeyRateLimit";
import { createLogger } from "@/utils/logger";
import { redisClient } from "@/utils/redisClient";
import { apiKeyPlugin } from "./apiKeyPlugin";

// Re-export consumeTokens for use in API handlers
export { consumeTokens } from "@/utils/apiKeyRateLimit";

const logger = createLogger("apiKeyRateLimitPlugin");

// Redis key for tracking rate limit rejections (for Prometheus metrics)
const RATE_LIMIT_REJECTIONS_KEY = "nexusgate:metrics:rate_limit_rejections";

/**
 * Track a rate limit rejection in Redis for Prometheus metrics
 * @param apiKeyComment The API key comment for label
 * @param limitType Type of limit exceeded ('rpm' or 'tpm')
 */
async function trackRateLimitRejection(
  apiKeyComment: string | null,
  limitType: "rpm" | "tpm",
): Promise<void> {
  try {
    const field = `${apiKeyComment ?? "unknown"}:${limitType}`;
    await redisClient.hincrby(RATE_LIMIT_REJECTIONS_KEY, field, 1);
  } catch (error) {
    logger.error("Failed to track rate limit rejection:", error);
  }
}

/**
 * Get all rate limit rejections from Redis for Prometheus metrics
 */
export async function getRateLimitRejections(): Promise<
  Record<string, string>
> {
  return await redisClient.hgetall(RATE_LIMIT_REJECTIONS_KEY);
}

/**
 * OpenAI-compatible rate limit error response
 */
function createRateLimitError(message: string) {
  return {
    error: {
      message,
      type: "rate_limit_error",
      code: "rate_limit_exceeded",
    },
  };
}

export const apiKeyRateLimitPlugin = new Elysia({
  name: "apiKeyRateLimitPlugin",
})
  .use(apiKeyPlugin)
  .macro({
    apiKeyRateLimit: {
      // apiKeyRecord is now a request-scoped context property from checkApiKey macro
      async resolve({ status, set, apiKeyRecord }) {
        if (!apiKeyRecord) {
          // No API key record means checkApiKey macro wasn't applied or failed
          // Skip rate limiting in this case
          return;
        }

        // Check RPM limit (consume 1 request token)
        const rpmResult = await checkRpmLimit(
          apiKeyRecord.id,
          apiKeyRecord.rpmLimit,
        );

        if (!rpmResult.allowed) {
          // Track rejection for Prometheus metrics
          await trackRateLimitRejection(apiKeyRecord.comment, "rpm");

          set.headers["X-RateLimit-Limit-RPM"] =
            apiKeyRecord.rpmLimit.toString();
          set.headers["X-RateLimit-Remaining-RPM"] = "0";
          set.headers["Retry-After"] = "60";

          return status(
            429,
            createRateLimitError(
              "Rate limit exceeded: too many requests per minute",
            ),
          );
        }

        // Check TPM limit (pre-flight, don't consume yet)
        const tpmResult = await checkTpmLimit(
          apiKeyRecord.id,
          apiKeyRecord.tpmLimit,
        );

        if (!tpmResult.allowed) {
          // Track rejection for Prometheus metrics
          await trackRateLimitRejection(apiKeyRecord.comment, "tpm");

          set.headers["X-RateLimit-Limit-TPM"] =
            apiKeyRecord.tpmLimit.toString();
          set.headers["X-RateLimit-Remaining-TPM"] = "0";
          set.headers["Retry-After"] = "60";

          return status(
            429,
            createRateLimitError("Rate limit exceeded: token quota exhausted"),
          );
        }

        // Set rate limit headers for successful requests
        set.headers["X-RateLimit-Limit-RPM"] = apiKeyRecord.rpmLimit.toString();
        set.headers["X-RateLimit-Remaining-RPM"] =
          rpmResult.remaining.toString();
        set.headers["X-RateLimit-Limit-TPM"] = apiKeyRecord.tpmLimit.toString();
        set.headers["X-RateLimit-Remaining-TPM"] =
          tpmResult.remaining.toString();
      },
    },
  });
