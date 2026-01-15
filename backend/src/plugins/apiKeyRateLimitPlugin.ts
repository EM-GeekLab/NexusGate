import { Elysia } from "elysia";
import { apiKeyPlugin } from "./apiKeyPlugin";
import { checkRpmLimit, checkTpmLimit } from "@/utils/apiKeyRateLimit";

// Re-export consumeTokens for use in API handlers
export { consumeTokens } from "@/utils/apiKeyRateLimit";

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
        set.headers["X-RateLimit-Remaining-RPM"] = rpmResult.remaining.toString();
        set.headers["X-RateLimit-Limit-TPM"] = apiKeyRecord.tpmLimit.toString();
        set.headers["X-RateLimit-Remaining-TPM"] = tpmResult.remaining.toString();
      },
    },
  });
