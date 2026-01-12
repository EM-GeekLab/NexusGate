import { exists, readFile } from "node:fs/promises";
import { join } from "node:path";
import { cors } from "@elysiajs/cors";
import { serverTiming } from "@elysiajs/server-timing";
import { staticPlugin } from "@elysiajs/static";
import { swagger } from "@elysiajs/swagger";
import { consola } from "consola";
import { Elysia } from "elysia";
import {
  ALLOWED_ORIGINS,
  FRONTEND_DIR,
  PORT,
  PRODUCTION,
} from "@/utils/config";
import { routes } from "@/api";
import { loggerPlugin } from "@/plugins/loggerPlugin";
import { initConfig } from "./utils/init";

await initConfig();

async function spaPlugin(dir: string) {
  if (!(await exists(dir))) {
    return undefined;
  }
  const indexPath = join(dir, "index.html");
  const indexHtml = (await exists(indexPath))
    ? await readFile(indexPath, "utf-8")
    : undefined;

  return new Elysia({ name: "spaPlugin" })
    .use(
      staticPlugin({
        assets: dir,
        alwaysStatic: true,
        indexHTML: false, // workaround until https://github.com/elysiajs/elysia-static/pull/57 is merged
        prefix: "/",
      }),
    )
    .get("/*", ({ headers: { accept }, status }) => {
      if (!indexHtml) {
        return status(404);
      }
      if (typeof accept === "string" && !["text/html", "*/*"].some((type) => accept.includes(type))) {
        return status(404);
      }
      return new Response(indexHtml, {
        headers: {
          "Content-Type": "text/html",
        },
      });
    })
    .get("/", ({ status }) => {
      if (!indexHtml) {
        return status(404);
      }
      return new Response(indexHtml, {
        headers: {
          "Content-Type": "text/html",
        },
      });
    });
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
      specPath: "/api/openapi.json",
    }),
  )
  .use(serverTiming())
  .use(routes)
  .use(await spaPlugin(FRONTEND_DIR))
  .listen({
    port: PORT,
    reusePort: PRODUCTION,
    hostname: "0.0.0.0",
    idleTimeout: 255,
  });

consola.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);

export type App = typeof app;
