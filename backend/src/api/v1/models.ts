import { Elysia } from "elysia";
import { listModels, listProviders } from "@/db";
import { createLogger } from "@/utils/logger";

const logger = createLogger("modelsQuery");

export const modelsQueryApi = new Elysia().get("/models", async () => {
  logger.debug("queryModels");

  const models = await listModels();
  const providers = await listProviders();
  const providerMap = new Map(providers.map((p) => [p.id, p]));

  // Group models by systemName and deduplicate
  const uniqueSystemNames = new Set<string>();
  const uniqueModels = models.filter((model) => {
    if (uniqueSystemNames.has(model.systemName)) {
      return false;
    }
    uniqueSystemNames.add(model.systemName);
    return true;
  });

  return {
    object: "list",
    data: uniqueModels.map((model) => {
      const provider = providerMap.get(model.providerId);
      return {
        id: model.systemName,
        object: "model",
        created: Math.floor(model.createdAt.getTime() / 1000),
        owned_by: provider?.name ?? "unknown",
      };
    }),
  };
});
