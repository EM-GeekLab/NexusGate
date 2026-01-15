import { Elysia, t } from "elysia";
import { findApiKey, listApiKeys, upsertApiKey, updateApiKey } from "@/db";
import { generateApiKey } from "@/utils/apiKey";
import { getRateLimitStatus } from "@/utils/apiKeyRateLimit";

export const adminApiKey = new Elysia()
  .get(
    "/apiKey",
    async ({ query }) => {
      return await listApiKeys(query.includeRevoked ?? false);
    },
    {
      query: t.Object({
        includeRevoked: t.Optional(t.Boolean()),
      }),
    },
  )
  .get(
    "/apiKey/:key",
    async ({ status, params }) => {
      const { key } = params;
      const r = await findApiKey(key);
      if (r === null) {
        return status(404, "Key not found");
      }
      return r;
    },
    {
      params: t.Object({
        key: t.String(),
      }),
    },
  )
  .post(
    "/apiKey",
    async ({ body, status }) => {
      const key = generateApiKey();
      const r = await upsertApiKey({
        key,
        comment: body.comment,
        expiresAt: body.expiresAt,
        rpmLimit: body.rpmLimit ?? 50,
        tpmLimit: body.tpmLimit ?? 50000,
      });
      if (r === null) {
        return status(500, "Failed to create key");
      }
      return {
        key: r.key,
        rpmLimit: r.rpmLimit,
        tpmLimit: r.tpmLimit,
      };
    },
    {
      body: t.Object({
        expiresAt: t.Optional(t.Date()),
        comment: t.Optional(t.String()),
        rpmLimit: t.Optional(t.Number({ minimum: 1, default: 50 })),
        tpmLimit: t.Optional(t.Number({ minimum: 1, default: 50000 })),
      }),
    },
  )
  .put(
    "/apiKey/:key/ratelimit",
    async ({ params, body, status }) => {
      const { key } = params;
      const r = await updateApiKey({
        key,
        rpmLimit: body.rpmLimit,
        tpmLimit: body.tpmLimit,
        updatedAt: new Date(),
      });
      if (r === null) {
        return status(404, "Key not found");
      }
      return {
        key: r.key,
        rpmLimit: r.rpmLimit,
        tpmLimit: r.tpmLimit,
      };
    },
    {
      params: t.Object({
        key: t.String(),
      }),
      body: t.Object({
        rpmLimit: t.Number({ minimum: 1 }),
        tpmLimit: t.Number({ minimum: 1 }),
      }),
    },
  )
  .get(
    "/apiKey/:key/usage",
    async ({ params, status }) => {
      const { key } = params;
      const apiKey = await findApiKey(key);
      if (!apiKey) {
        return status(404, "Key not found");
      }

      const usage = await getRateLimitStatus(apiKey.id, {
        rpmLimit: apiKey.rpmLimit,
        tpmLimit: apiKey.tpmLimit,
      });

      return {
        key: apiKey.key,
        limits: {
          rpm: apiKey.rpmLimit,
          tpm: apiKey.tpmLimit,
        },
        usage,
      };
    },
    {
      params: t.Object({
        key: t.String(),
      }),
    },
  )
  .delete(
    "/apiKey/:key",
    async ({ status, params }) => {
      const { key } = params;
      const r = await upsertApiKey({
        key,
        revoked: true,
        updatedAt: new Date(),
      });
      if (r === null) {
        return status(404, "Key not found");
      }
      return {
        key: r.key,
        revoked: r.revoked,
      };
    },
    {
      params: t.Object({
        key: t.String(),
      }),
    },
  );
