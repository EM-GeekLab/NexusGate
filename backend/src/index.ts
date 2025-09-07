import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { serverTiming } from "@elysiajs/server-timing";
import { routes } from "@/api";
import { loggerPlugin } from "@/plugins/loggerPlugin";
import { ALLOWED_ORIGINS, PORT, PRODUCTION, FRONTEND_DIR } from "@/utils/config";
import { consola } from "consola";
import { initConfig } from "./utils/init";
import { staticPlugin } from "@elysiajs/static";
import { exists, readFile } from "node:fs/promises"
import { join, resolve } from "node:path";

await initConfig();

let app = new Elysia()
  .use(loggerPlugin)
  .use(
    cors({
      origin: ALLOWED_ORIGINS,
    }),
  )
  .use(
    swagger({
      documentation: {
        components: {
          securitySchemes: {
            adminSecret: {
              type: "http",
              scheme: "bearer",
            },
            apiKey: {
              type: "http",
              scheme: "bearer",
            },
          },
        },
        info: {
          title: "NexusGate API Documentation",
          version: "0.0.1",
        },
      },
      path: "/api/docs",
      specPath: "/api/openapi.json"
    }),
  )
  .use(serverTiming())
  .use(routes);

if (await exists(FRONTEND_DIR)) {
  const dir = resolve(FRONTEND_DIR);
  consola.log(`Setting up static file serving from ${dir}`);
  app = app.use(staticPlugin({
    assets: dir,
    alwaysStatic: true,
    prefix: "/",
  }))
  if (await exists(join(dir, "index.html"))) {
    const indexHtml = await readFile(join(dir, "index.html"), "utf-8");
    app = app.get("/*", ({ headers: { accept } }) => {
      if (typeof accept === "string" && !accept.includes("text/html")) {
        return new Response("Not Found", {
          status: 404,
        });
      }
      return new Response(indexHtml, {
        headers: {
          "Content-Type": "text/html",
        },
      });
    });
  }
}

app = app.listen({
  port: PORT,
  reusePort: PRODUCTION,
  hostname: "0.0.0.0",
  idleTimeout: 255,
});

consola.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
