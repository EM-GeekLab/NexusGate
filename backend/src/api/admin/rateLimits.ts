import { getAllRateLimits, getRateLimitConfig, setRateLimitConfig, deleteRateLimitConfig } from "@/utils/rateLimitConfig";
import Elysia, { t } from "elysia";

export const adminRateLimits = new Elysia()
  .get("/ratelimits", async () => {
    return getAllRateLimits();
  })
  .get(
    "/ratelimits/:identifier",
    async ({ params, error }) => {
      const { identifier } = params;
      const config = getRateLimitConfig(identifier);
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
    "/ratelimits",
    async ({ body, error, set }) => {
      const { identifier, ...config } = body;
      const existing = getRateLimitConfig(identifier);
      
      if (existing && Object.keys(existing).length > 0) {
        return error(409, "Rate limit configuration already exists");
      }
      
      const success = setRateLimitConfig(identifier, config);
      if (!success) {
        return error(500, "Failed to create rate limit configuration");
      }
      
      set.status = 201;
      return { identifier, ...config };
    },
    {
      body: t.Object({
        identifier: t.String({ minLength: 1 }),
        limit: t.Number({ minimum: 1 }),
        refill: t.Number({ minimum: 0.1 }),
        idleTime: t.Optional(t.Number({ minimum: 0 })),
      }),
    },
  )
  .delete(
    "/ratelimits/:identifier",
    async ({ params, error, set }) => {
      const { identifier } = params;
      const existing = getRateLimitConfig(identifier);
      
      if (!existing || Object.keys(existing).length === 0) {
        return error(404, "Rate limit configuration not found");
      }
      
      const success = deleteRateLimitConfig(identifier);
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