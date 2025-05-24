import {
  getAllRateLimits,
  getRateLimitConfig,
  setRateLimitConfig,
  deleteRateLimitConfig,
} from "@/utils/rateLimitConfig";
import Elysia, { t } from "elysia";

export const adminRateLimits = new Elysia()
  .get("/rateLimits", async () => {
    return await getAllRateLimits();
  })
  .get(
    "/rateLimit/:identifier",
    async ({ params, error }) => {
      const { identifier } = params;
      const config = await getRateLimitConfig(identifier);
      if (!config) {
        return error(404, "Rate limit configuration not found");
      }
      return { identifier, ...config };
    },
    {
      params: t.Object({
        identifier: t.String(),
      }),
    },
  )
  .post(
    "/rateLimit",
    async ({ body, error, set }) => {
      const { identifier, ...config } = body;
      const existing = await getRateLimitConfig(identifier);

      if (existing && Object.keys(existing).length > 0) {
        return error(409, "Rate limit configuration already exists");
      }

      const success = await setRateLimitConfig(identifier, config);
      if (!success) {
        return error(500, "Failed to create rate limit configuration");
      }

      set.status = 201;
      return { identifier, ...config };
    },
    {    body: t.Object({
      identifier: t.String({ minLength: 1 }),
      limit: t.Number({ minimum: 1 }),
      refill: t.Number({ minimum: 0.1 }),
      apiKeySpecific: t.Boolean({ default: false }),
    }),
    },
  )
  .delete(
    "/rateLimit/:identifier",
    async ({ params, error, set }) => {
      const { identifier } = params;
      const existing = await getRateLimitConfig(identifier);

      if (!existing || Object.keys(existing).length === 0) {
        return error(404, "Rate limit configuration not found");
      }

      const success = await deleteRateLimitConfig(identifier);
      if (!success) {
        return error(500, "Failed to delete rate limit configuration");
      }

      set.status = 204;
      return null;
    },
    {
      params: t.Object({
        identifier: t.String(),
      }),
    },
  );
