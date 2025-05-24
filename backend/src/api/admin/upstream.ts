import { deleteUpstream, insertUpstream, listUpstreams } from "@/db";
import { setRateLimitConfig } from "@/utils/rateLimitConfig";
import Elysia, { t } from "elysia";

export const adminUpstream = new Elysia()
  .get("/upstream", async (_) => {
    return await listUpstreams();
  })
  .post(
    "/upstream",
    async ({ body, error }) => {
      const r = await insertUpstream(body);
      if (r === null) {
        return error(500, "Failed to create upstream");
      }
      if (body.rateLimit) {
        const rRateLimit = await setRateLimitConfig(body.model, body.rateLimit);
        return {
          ...r,
          rateLimit: rRateLimit,
        };
      }
      return r;
    },
    {
      body: t.Object({
        model: t.String(),
        upstreamModel: t.Optional(t.String()),
        name: t.String(),
        url: t.String(),
        apiKey: t.Optional(t.String()),
        rateLimit: t.Optional(
          t.Object({
            limit: t.Integer(),
            refill: t.Integer(),
            apiKeySpecific: t.Boolean(),
          }),
        ),
      }),
    },
  )
  .delete(
    "/upstream/:id",
    async ({ error, params }) => {
      const { id } = params;
      const r = await deleteUpstream(id);
      if (r === null) {
        return error(404, "Upstream not found");
      }
      return r;
    },
    {
      params: t.Object({
        id: t.Integer(),
      }),
    },
  );
