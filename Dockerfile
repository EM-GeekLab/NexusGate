FROM node:25 AS builder
COPY --from=oven/bun:1-slim /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

RUN --mount=type=cache,target=/cache \
    --mount=type=bind,source=bun.lock,target=bun.lock \
    --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=backend/package.json,target=backend/package.json \
    --mount=type=bind,source=frontend/package.json,target=frontend/package.json \
    BUN_INSTALL_CACHE_DIR=/cache \
    bun ci

COPY . .
RUN bun run build

FROM oven/bun:1-alpine AS runner 

WORKDIR /app
COPY --from=builder /app/backend/out/index.js /app/index.js
COPY --from=builder /app/backend/drizzle /app/drizzle
COPY --from=builder /app/frontend/dist /app/dist

ENV NODE_ENV=production
LABEL org.opencontainers.image.source="https://github.com/EM-GeekLab/NexusGate"
LABEL org.opencontainers.image.licenses="Apache-2.0"

USER bun
EXPOSE 3000/tcp

ENTRYPOINT [ "bun", "run", "index.js" ]