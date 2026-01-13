import { Elysia } from "elysia";
import { checkApiKey } from "@/utils/apiKey.ts";
import { ADMIN_SUPER_SECRET } from "@/utils/config.ts";

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
  .macro({
    checkApiKey: {
      async beforeHandle({ status, bearer }) {
        if (!bearer || !(await checkApiKey(bearer))) {
          return status(401, "Invalid API key");
        }
      },
    },
    checkAdminApiKey: {
      async beforeHandle({ status, bearer }) {
        if (!bearer || !(bearer === ADMIN_SUPER_SECRET)) {
          return status(401, "Invalid admin secret");
        }
      },
    },
  });
