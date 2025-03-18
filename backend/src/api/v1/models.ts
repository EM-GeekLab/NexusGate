import { Elysia } from "elysia";

import { consola } from "consola";
import { listUpstreams } from "@/db";

const logger = consola.withTag("modelsQuery");

export const modelsQueryApi = new Elysia().get("/models", async ({ error }) => {
  logger.debug("queryModels");

  const upstreams = await listUpstreams();
  return {
    object: "list",
    data: upstreams.map((upstream) => ({
      id: upstream.model,
      object: "model",
      created: upstream.createdAt.getTime(),
      owned_by: upstream.name,
    })),
  };
});
