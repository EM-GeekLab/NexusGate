import { cors } from "@elysiajs/cors";
import { serverTiming } from "@elysiajs/server-timing";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { access, readFile, stat } from "node:fs/promises";
// Note: @elysiajs/static is disabled in current Bun version, using manual file serving instead
import { log } from "@/utils/logger";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
import { join } from "node:path";
import { routes } from "@/api";
import { metricsApi } from "@/api/metrics";
import { loggerPlugin } from "@/plugins/loggerPlugin";
import { startAlertEngine } from "@/services/alertEngine";
import {
  ALLOWED_ORIGINS,
  DOCS_DIR,
  FRONTEND_DIR,
  PORT,
  PRODUCTION,
} from "@/utils/config";
import { initConfig } from "./utils/init";

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

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return mimeTypes[ext || ""] || "application/octet-stream";
}

async function serveStaticFile(filePath: string) {
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      const content = await readFile(filePath);
      return new Response(content, {
        headers: { "Content-Type": getMimeType(filePath) },
      });
    }
  } catch {
    // File doesn't exist or can't be read
  }
  return null;
}

async function docsPlugin(dir: string) {
  if (!(await exists(dir))) {
    return undefined;
  }
  const indexPath = join(dir, "index.html");
  const indexHtml = (await exists(indexPath))
    ? await readFile(indexPath, "utf-8")
    : undefined;

  return (
    new Elysia({ name: "docsPlugin" })
      // Handle TanStack Start's __tsr static server function cache requests
      // These are requested from root path, not /docs/
      .get("/__tsr/*", async ({ path, status }) => {
        const response = await serveStaticFile(join(dir, path));
        return response || status(404);
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
        if (!indexHtml) {
          return status(404);
        }
        const subPath = path.replace("/docs", "");
        const exactPath = join(dir, subPath);

        // Try to serve as static file
        const staticResponse = await serveStaticFile(exactPath);
        if (staticResponse) {
          return staticResponse;
        }

        // Check if there's a specific HTML file for this path (directory with index.html)
        const specificHtmlPath = join(dir, subPath, "index.html");
        if (await exists(specificHtmlPath)) {
          const html = await readFile(specificHtmlPath, "utf-8");
          return new Response(html, {
            headers: { "Content-Type": "text/html" },
          });
        }

        // Fall back to main index.html for SPA routing
        return new Response(indexHtml, {
          headers: { "Content-Type": "text/html" },
        });
      })
  );
}

async function spaPlugin(dir: string) {
  if (!(await exists(dir))) {
    return undefined;
  }
  const indexPath = join(dir, "index.html");
  const indexHtml = (await exists(indexPath))
    ? await readFile(indexPath, "utf-8")
    : undefined;

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
      const staticResponse = await serveStaticFile(join(dir, path));
      if (staticResponse) {
        return staticResponse;
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

export type App = typeof app;
