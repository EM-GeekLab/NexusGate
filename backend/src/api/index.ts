import { Elysia } from "elysia";
import { routes as adminRoutes } from "./admin";
import { usageQueryApi } from "./usage";
import { completionsApi } from "./v1/completions";
import { modelsQueryApi } from "./v1/models";

export const routes = new Elysia()
  .group("/v1", (app) => app.use(completionsApi).use(modelsQueryApi))
  .group("/api", (app) => app.use(usageQueryApi).use(adminRoutes));
