import { Elysia } from "elysia";
import { apiKeyPlugin } from "@/plugins/apiKeyPlugin";
import { adminApiKey } from "./apiKey";
import { adminUpstream } from "./upstream";
import { adminCompletions } from "./completions";
import { adminUsage } from "./usage";
import { COMMIT_SHA } from "@/utils/config";
import { adminRateLimits } from "./rateLimits";

export const routes = new Elysia({
  detail: {
    security: [{ adminSecret: [] }],
  },
})
  .use(apiKeyPlugin)
  .group("/admin", (app) =>
    app.guard({ checkAdminApiKey: true }, (app) =>
      app
        .use(adminApiKey)
        .use(adminUpstream)
        .use(adminCompletions)
        .use(adminUsage)
        .use(adminRateLimits)
        .get("/", () => true, {
          detail: { description: "Check whether the admin secret is valid." },
        })
        .get("/rev", () => ({
          version: COMMIT_SHA,
        })),
    ),
  );
