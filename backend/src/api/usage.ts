import { Elysia } from "elysia";
import { sumCompletionTokenUsage } from "@/db";
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
    async ({ status, apiKeyRecord }) => {
      if (apiKeyRecord === null) {
        return status(500);
      }

      logger.debug("queryUsage", { apiKeyId: apiKeyRecord.id });
      return sumCompletionTokenUsage(apiKeyRecord.id);
    },
    {
      checkApiKey: true,
    },
  );
