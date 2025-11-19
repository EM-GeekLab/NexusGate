import { consola } from "consola";
import { Elysia } from "elysia";

const logger = consola.withTag("router");

export const loggerPlugin = new Elysia({
  name: "loggerPlugin",
}).onAfterResponse({ as: "global" }, ({ request, set }) => {
  logger.log(`${request.url} ${set.status}`);
});
