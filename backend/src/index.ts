import { cors } from "@elysiajs/cors";
import { serverTiming } from "@elysiajs/server-timing";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { readFile, realpath } from "node:fs/promises";
import { basename } from "node:path";
import { routes } from "@/api";
import { metricsApi } from "@/api/metrics";
import { loggerPlugin } from "@/plugins/loggerPlugin";
import { startAlertEngine, stopAlertEngine } from "@/services/alertEngine";
import {
  ALLOWED_ORIGINS,
  DOCS_DIR,
  FRONTEND_DIR,
  PORT,
  PRODUCTION,
} from "@/utils/config";
import { log } from "@/utils/logger";
import { initConfig } from "./utils/init";
import { resolveStaticFile } from "@/utils/staticFile";

await initConfig();

const mimeTypes: Record<string, string> = {
  js: "application/javascript",
  mjs: "application/javascript",
  css: "text/css",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  eot: "application/vnd.ms-fontobject",
  map: "application/json",
  html: "text/html",
  txt: "text/plain",
  xml: "application/xml",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pdf: "application/pdf",
};

function getMimeType(requestPath: string): string {
  const name = basename(requestPath);
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return mimeTypes[ext] || "application/octet-stream";
}

// The static plugin is disabled in this Bun version.
async function serveStaticFile(rootDir: string, requestPath: string) {
  const filePath = await resolveStaticFile(rootDir, requestPath);
  if (filePath === null || filePath === undefined) {
    return filePath;
  }

  return new Response(await readFile(filePath), {
    headers: { "Content-Type": getMimeType(requestPath) },
  });
}

async function readStaticIndex(rootDir: string) {
  const filePath = await resolveStaticFile(rootDir, "/index.html");
  return filePath ? readFile(filePath, "utf-8") : undefined;
}

async function docsPlugin(dir: string) {
  const root = await realpath(dir).catch(() => undefined);
  if (root === undefined) {
    return undefined;
  }
  const indexHtml = await readStaticIndex(root);

  return (
    new Elysia({ name: "docsPlugin" })
      // Handle TanStack Start's __tsr static server function cache requests
      // These are requested from root path, not /docs/
      .get("/__tsr/*", async ({ path, status }) => {
        const response = await serveStaticFile(root, path);
        return response ?? status(404);
      })
      .get("/docs", ({ status }) => {
        if (!indexHtml) {
          return status(404);
        }
        return new Response(indexHtml, {
          headers: { "Content-Type": "text/html" },
        });
      })
      .get("/docs/*", async ({ path, status }) => {
        const subPath = path.slice("/docs".length);
        const staticResponse = await serveStaticFile(root, subPath);
        if (staticResponse !== undefined) {
          return staticResponse ?? status(404);
        }

        const directoryIndex = await serveStaticFile(
          root,
          `${subPath}/index.html`,
        );
        if (directoryIndex !== undefined) {
          return directoryIndex ?? status(404);
        }

        // Fall back to main index.html for SPA routing
        if (!indexHtml) {
          return status(404);
        }
        return new Response(indexHtml, {
          headers: { "Content-Type": "text/html" },
        });
      })
  );
}

async function spaPlugin(dir: string) {
  const root = await realpath(dir).catch(() => undefined);
  if (root === undefined) {
    return undefined;
  }
  const indexHtml = await readStaticIndex(root);

  return new Elysia({ name: "spaPlugin" })
    .get("/", ({ status }) => {
      if (!indexHtml) {
        return status(404);
      }
      return new Response(indexHtml, {
        headers: { "Content-Type": "text/html" },
      });
    })
    .get("/*", async ({ path, status }) => {
      // Skip /docs and /__tsr routes - they're handled by docsPlugin
      if (path.startsWith("/docs") || path.startsWith("/__tsr")) {
        return status(404);
      }
      // Skip API routes and metrics (include trailing slash to prevent SPA fallback)
      if (
        path.startsWith("/api") ||
        path.startsWith("/v1") ||
        path === "/metrics" ||
        path === "/metrics/"
      ) {
        return status(404);
      }

      // Try to serve as static file first
      const staticResponse = await serveStaticFile(root, path);
      if (staticResponse !== undefined) {
        return staticResponse ?? status(404);
      }

      // Fall back to index.html for SPA routing
      if (!indexHtml) {
        return status(404);
      }
      return new Response(indexHtml, {
        headers: { "Content-Type": "text/html" },
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
  .use(metricsApi)
  .use(await docsPlugin(DOCS_DIR))
  .use(await spaPlugin(FRONTEND_DIR))
  .listen({
    port: PORT,
    reusePort: PRODUCTION,
    hostname: "0.0.0.0",
    idleTimeout: 255,
  });

log.info(`Elysia is running at ${app.server?.hostname}:${app.server?.port}`);

startAlertEngine();

const shutdown = () => {
  log.info("Shutting down...");
  stopAlertEngine();
  void app.stop().then(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export type App = typeof app;
