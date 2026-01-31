import { Elysia } from "elysia";
import { findApiKey, sumCompletionTokenUsage } from "@/db";
import { apiKeyPlugin } from "@/plugins/apiKeyPlugin";
import { createLogger } from "@/utils/logger";

const logger = createLogger("usageQuery");

export const usageQueryApi = new Elysia({
  detail: {
    security: [{ apiKey: [] }],
  },
})
  .use(apiKeyPlugin)
  .get(
    "/usage",
    async ({ status, bearer }) => {
      if (bearer === undefined) {
        return status(500);
      }

      logger.debug("queryUsage", bearer);
      const key = await findApiKey(bearer);
      if (key === null) {
        return null;
      }
      return sumCompletionTokenUsage(key.id);
    },
    {
      checkApiKey: true,
    },
  );
