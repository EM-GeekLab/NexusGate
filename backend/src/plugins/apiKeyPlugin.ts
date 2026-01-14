import { Elysia } from "elysia";
import { validateApiKey } from "@/utils/apiKey.ts";
import { ADMIN_SUPER_SECRET } from "@/utils/config.ts";
import type { ApiKey } from "@/db";

// Re-export ApiKey type for consumers
export type { ApiKey } from "@/db";

export const apiKeyPlugin = new Elysia({ name: "apiKeyPlugin" })
  .derive({ as: "global" }, ({ headers }) => {
    // Support Authorization: Bearer header (OpenAI style)
    if (headers.authorization) {
      const [method, key] = headers.authorization.split(" ");
      if (method === "Bearer" && key) {
        return {
          bearer: key,
        };
      }
    }

    // Support x-api-key header (Anthropic style)
    const xApiKey = headers["x-api-key"];
    if (xApiKey) {
      return {
        bearer: xApiKey,
      };
    }

    return;
  })
  .state("apiKeyRecord", null as ApiKey | null)
  .macro({
    checkApiKey: {
      async resolve({ status, bearer, store }) {
        if (!bearer) {
          return status(401, "Invalid API key");
        }

        const apiKeyRecord = await validateApiKey(bearer);
        if (!apiKeyRecord) {
          return status(401, "Invalid API key");
        }

        // Store API key record for rate limiting and other uses
        store.apiKeyRecord = apiKeyRecord;
      },
    },
    checkAdminApiKey: {
      beforeHandle({ status, bearer }) {
        if (!bearer || !(bearer === ADMIN_SUPER_SECRET)) {
          return status(401, "Invalid admin secret");
        }
      },
    },
  });
