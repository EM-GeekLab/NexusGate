FROM node:25 AS builder
COPY --from=oven/bun:1-slim /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

RUN --mount=type=cache,target=/cache \
    --mount=type=bind,source=bun.lock,target=bun.lock \
    --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=backend/package.json,target=backend/package.json \
    --mount=type=bind,source=frontend/package.json,target=frontend/package.json \
    --mount=type=bind,source=docs/package.json,target=docs/package.json \
    BUN_INSTALL_CACHE_DIR=/cache \
    bun ci --ignore-scripts

COPY . .
RUN mkdir -p backend/docs && cd docs && bun x fumadocs-mdx
# CI pre-builds frontend and docs outside Docker for speed (static assets
# have no arch dependency). Detect what's pre-built and only build what's
# missing. The fallback builds everything inside Docker.
RUN if [ -f frontend/dist/index.html ] && [ -f backend/docs/index.html ]; then \
      echo "Pre-built frontend and docs detected, building backend only"; \
      bun x turbo run build --filter=nexus-gate-server; \
    elif [ -f backend/docs/index.html ]; then \
      echo "Pre-built docs detected, building backend + frontend"; \
      bun x turbo run build --filter=nexus-gate-server --filter=nexus-gate-web; \
    else \
      bun run build; \
      (cd docs && bun run build); \
      if [ ! -f backend/docs/index.html ]; then \
        node scripts/generate-docs-shell.cjs backend/docs/assets backend/docs/index.html; \
      fi; \
    fi

FROM oven/bun:1-alpine AS runner

WORKDIR /app
COPY --from=builder /app/backend/out/index.js /app/index.js
COPY --from=builder /app/backend/drizzle /app/drizzle
COPY --from=builder /app/frontend/dist /app/dist
COPY --from=builder /app/backend/docs /app/docs

ENV NODE_ENV=production
LABEL org.opencontainers.image.source="https://github.com/EM-GeekLab/NexusGate"
LABEL org.opencontainers.image.licenses="Apache-2.0"

USER bun
EXPOSE 3000/tcp

ENTRYPOINT [ "bun", "run", "index.js" ]