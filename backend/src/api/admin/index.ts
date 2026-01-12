import { Elysia } from "elysia";
import { COMMIT_SHA } from "@/utils/config";
import { apiKeyPlugin } from "@/plugins/apiKeyPlugin";
import { adminApiKey } from "./apiKey";
import { adminCompletions } from "./completions";
import { adminRateLimits } from "./rateLimits";
import { adminUpstream } from "./upstream";
import { adminUsage } from "./usage";
import { adminProviders } from "./providers";
import { adminModels } from "./models";
import { adminEmbeddings } from "./embeddings";

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
        .get("/", () => true, {
          detail: { description: "Check whether the admin secret is valid." },
        })
        .get("/rev", () => ({
          version: COMMIT_SHA,
        })),
    ),
  );
