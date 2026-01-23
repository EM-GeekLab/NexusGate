import { cors } from "@elysiajs/cors";
import { serverTiming } from "@elysiajs/server-timing";
import { staticPlugin } from "@elysiajs/static";
import { swagger } from "@elysiajs/swagger";
import { consola } from "consola";
import { Elysia } from "elysia";
import { exists, readFile } from "node:fs/promises";
import { join } from "node:path";
import { routes } from "@/api";
import { loggerPlugin } from "@/plugins/loggerPlugin";
import {
  ALLOWED_ORIGINS,
  DOCS_DIR,
  FRONTEND_DIR,
  PORT,
  PRODUCTION,
} from "@/utils/config";
import { initConfig } from "./utils/init";

await initConfig();

async function docsPlugin(dir: string) {
  if (!(await exists(dir))) {
    return undefined;
  }
  const indexPath = join(dir, "index.html");
  const indexHtml = (await exists(indexPath))
    ? await readFile(indexPath, "utf-8")
    : undefined;

  return new Elysia({ name: "docsPlugin" })
    .use(
      staticPlugin({
        assets: dir,
        alwaysStatic: true,
        indexHTML: false,
        prefix: "/docs",
      }),
    )
    .get("/docs", ({ status }) => {
      if (!indexHtml) {
        return status(404);
      }
      return new Response(indexHtml, {
        headers: {
          "Content-Type": "text/html",
        },
      });
    })
    .get("/docs/*", async ({ path, status }) => {
      if (!indexHtml) {
        return status(404);
      }
      const subPath = path.replace("/docs", "");
      // Check if there's an exact file at this path (for static assets)
      const exactPath = join(dir, subPath);
      if (await exists(exactPath)) {
        // Let staticPlugin handle static files - return undefined to pass through
        // But Elysia doesn't support pass-through, so we return 404 for assets
        // The staticPlugin should have already handled this, but if we're here
        // it means there's a routing conflict - check if it's not a directory
        const stat = await import("node:fs/promises").then((fs) =>
          fs.stat(exactPath).catch(() => null),
        );
        if (stat && stat.isFile()) {
          // This is a static file that should be served by staticPlugin
          // Since we can't pass through, return 404 and staticPlugin won't help
          // We need to serve it ourselves
          const content = await readFile(exactPath);
          const ext = subPath.split(".").pop()?.toLowerCase();
          const mimeTypes: Record<string, string> = {
            js: "application/javascript",
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
          };
          const contentType = mimeTypes[ext || ""] || "application/octet-stream";
          return new Response(content, {
            headers: { "Content-Type": contentType },
          });
        }
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
    });
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
    .use(
      staticPlugin({
        assets: dir,
        alwaysStatic: true,
        indexHTML: false, // workaround until https://github.com/elysiajs/elysia-static/pull/57 is merged
        prefix: "/",
      }),
    )
    .get("/*", ({ headers: { accept }, path, status }) => {
      // Skip /docs routes - they're handled by docsPlugin
      if (path.startsWith("/docs")) {
        return status(404);
      }
      if (!indexHtml) {
        return status(404);
      }
      if (
        typeof accept === "string" &&
        !["text/html", "*/*"].some((type) => accept.includes(type))
      ) {
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
  .use(await docsPlugin(DOCS_DIR))
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
