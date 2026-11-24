import { Elysia } from "elysia";
import { createLogger } from "@/utils/logger";

const logger = createLogger("router");

export const loggerPlugin = new Elysia({
  name: "loggerPlugin",
}).onAfterResponse({ as: "global" }, ({ request, route, set }) => {
  // Only log the registered template; even the raw path can contain a key.
  logger.info(`${request.method} ${route ?? "<unmatched>"} ${set.status}`);
});
