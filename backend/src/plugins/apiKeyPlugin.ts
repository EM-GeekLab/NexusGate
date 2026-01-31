import { Elysia } from "elysia";
import type { ApiKey } from "@/db";
import { validateApiKey } from "@/utils/apiKey.ts";
import { ADMIN_SUPER_SECRET } from "@/utils/config.ts";

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
  // Request-scoped apiKeyRecord - initialized as null, populated by checkApiKey macro
  // Using derive ensures each request gets its own instance (not shared like state)
  .derive({ as: "global" }, () => ({
    apiKeyRecord: null as ApiKey | null,
  }))
  .macro({
    checkApiKey: {
      // Resolve runs before the handler and can modify the request context
      // The apiKeyRecord from derive above will be overwritten with the actual value
      async resolve({ status, bearer, apiKeyRecord: _ }) {
        if (!bearer) {
          return status(401, "Invalid API key");
        }

        const apiKeyRecord = await validateApiKey(bearer);
        if (!apiKeyRecord) {
          return status(401, "Invalid API key");
        }

        // Return apiKeyRecord - this merges into the context for this request only
        return {
          apiKeyRecord,
        };
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
