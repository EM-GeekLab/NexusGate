import { Elysia } from "elysia";
import { apiKeyPlugin } from "@/plugins/apiKeyPlugin";
import { COMMIT_SHA } from "@/utils/config";
import { adminApiKey } from "./apiKey";
import { adminCompletions } from "./completions";
import { adminDashboards } from "./dashboards";
import { adminEmbeddings } from "./embeddings";
import { adminModels } from "./models";
import { adminProviders } from "./providers";
import { adminRateLimits } from "./rateLimits";
import { adminSettings } from "./settings";
import { adminStats } from "./stats";
import { adminUpstream } from "./upstream";
import { adminUsage } from "./usage";

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
        .use(adminProviders)
        .use(adminModels)
        .use(adminEmbeddings)
        .use(adminStats)
        .use(adminSettings)
        .use(adminDashboards)
        .get("/", () => true, {
          detail: { description: "Check whether the admin secret is valid." },
        })
        .get("/rev", () => ({
          version: COMMIT_SHA,
        })),
    ),
  );
