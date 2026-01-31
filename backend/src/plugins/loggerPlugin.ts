import { Elysia } from "elysia";
import { createLogger } from "@/utils/logger";

const logger = createLogger("router");

export const loggerPlugin = new Elysia({
  name: "loggerPlugin",
}).onAfterResponse({ as: "global" }, ({ request, set }) => {
  logger.info(`${request.url} ${set.status}`);
});
