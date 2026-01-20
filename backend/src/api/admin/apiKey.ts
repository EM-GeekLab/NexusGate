import { Elysia, t } from "elysia";
import {
  findApiKey,
  findApiKeyByExternalId,
  listApiKeys,
  listApiKeysBySource,
  upsertApiKey,
  updateApiKey,
} from "@/db";
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
  )
  // ============================================
  // K8s Operator Integration Endpoints
  // ============================================
  .get(
    "/apiKey/by-external-id/:externalId",
    async ({ status, params }) => {
      const { externalId } = params;
      const r = await findApiKeyByExternalId(decodeURIComponent(externalId));
      if (r === null) {
        return status(404, "Key not found");
      }
      return r;
    },
    {
      params: t.Object({
        externalId: t.String(),
      }),
      detail: {
        summary: "Find API key by external ID",
        description:
          "Find an API key by its external ID (used by K8s Operator)",
      },
    },
  )
  .put(
    "/apiKey/by-external-id/:externalId",
    async ({ params, body, status }) => {
      const externalId = decodeURIComponent(params.externalId);

      // First, try to find existing key
      const existing = await findApiKeyByExternalId(externalId);
      if (existing) {
        if (existing.revoked) {
          // Key exists but is revoked - reactivate it
          const reactivated = await updateApiKey({
            key: existing.key,
            revoked: false,
            comment: body.comment ?? existing.comment,
            rpmLimit: body.rpmLimit ?? existing.rpmLimit,
            tpmLimit: body.tpmLimit ?? existing.tpmLimit,
            updatedAt: new Date(),
          });

          if (reactivated === null) {
            return status(500, "Failed to reactivate key");
          }

          return {
            key: reactivated.key,
            id: reactivated.id,
            created: false,
            externalId: reactivated.externalId,
          };
        }

        // Key exists and is active - return it (idempotent behavior)
        return {
          key: existing.key,
          id: existing.id,
          created: false,
          externalId: existing.externalId,
        };
      }

      // Key does not exist - try to create it, handling race conditions
      try {
        const key = generateApiKey();
        const r = await upsertApiKey({
          key,
          externalId,
          comment: body.comment,
          source: "operator",
          rpmLimit: body.rpmLimit,
          tpmLimit: body.tpmLimit,
        });

        if (r === null) {
          return status(500, "Failed to create key");
        }

        return {
          key: r.key,
          id: r.id,
          created: true,
          externalId: r.externalId,
        };
      } catch (e: unknown) {
        // Handle race condition: if insert fails due to unique constraint on external_id,
        // another concurrent request created it. Fetch and return it.
        if (
          e instanceof Error &&
          "code" in e &&
          (e as { code: string }).code === "23505"
        ) {
          const raceExisting = await findApiKeyByExternalId(externalId);
          if (raceExisting) {
            return {
              key: raceExisting.key,
              id: raceExisting.id,
              created: false,
              externalId: raceExisting.externalId,
            };
          }
        }
        // For other errors, or if refetch fails, return 500
        return status(500, "Failed to create or retrieve key");
      }
    },
    {
      params: t.Object({
        externalId: t.String(),
      }),
      body: t.Object({
        comment: t.Optional(t.String()),
        rpmLimit: t.Optional(t.Number({ minimum: 1, default: 50 })),
        tpmLimit: t.Optional(t.Number({ minimum: 1, default: 50000 })),
      }),
      detail: {
        summary: "Ensure API key exists for external ID (idempotent)",
        description:
          "Creates a new API key if one doesn't exist for the external ID, or returns the existing one. Used by K8s Operator for automatic key provisioning.",
      },
    },
  )
  .get(
    "/apiKey/managed",
    async ({ query }) => {
      return await listApiKeysBySource(
        "operator",
        query.includeRevoked ?? false,
      );
    },
    {
      query: t.Object({
        includeRevoked: t.Optional(t.Boolean()),
      }),
      detail: {
        summary: "List API keys managed by K8s Operator",
        description:
          "Returns all API keys that were created by the K8s Operator (source='operator')",
      },
    },
  );
