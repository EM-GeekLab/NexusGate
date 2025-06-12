import { findApiKey, listApiKeys, upsertApiKey } from "@/db";
import { generateApiKey } from "@/utils/apiKey";
import { Elysia, t } from "elysia";

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
        expiresAt: body.expires_at,
      });
      if (r === null) {
        return status(500, "Failed to create key");
      }
      return {
        key: r.key,
      };
    },
    {
      body: t.Object({
        expires_at: t.Optional(t.Date()),
        comment: t.Optional(t.String()),
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
