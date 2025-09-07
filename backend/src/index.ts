import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { serverTiming } from "@elysiajs/server-timing";
import { routes } from "@/api";
import { loggerPlugin } from "@/plugins/loggerPlugin";
import { ALLOWED_ORIGINS, PORT, PRODUCTION } from "@/utils/config";
import { consola } from "consola";
import { initConfig } from "./utils/init";
import { staticPlugin } from "@elysiajs/static";
import { exists, readFile } from "node:fs/promises"

await initConfig();

let indexHtml = "";
if (await exists("dist/index.html")) {
  indexHtml = await readFile("dist/index.html", "utf-8");
}

const app = new Elysia()
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
  .use(routes)
  .use(staticPlugin({
    assets: "dist",
    alwaysStatic: true,
    prefix: "/",
  })).get("/*", ({ headers: { accept } }) => {
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
  }, {
    headers: t.Object({
      accept: t.Optional(t.String())
    })
  })
  .listen({
    port: PORT,
    reusePort: PRODUCTION,
    hostname: "0.0.0.0",
    idleTimeout: 255,
  });

consola.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
