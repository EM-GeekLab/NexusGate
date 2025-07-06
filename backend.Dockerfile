FROM oven/bun:1-alpine AS base
WORKDIR /app
ENV NODE_ENV=production
LABEL org.opencontainers.image.source="https://github.com/EM-GeekLab/NexusGate"
LABEL org.opencontainers.image.licenses="Apache-2.0"

FROM base AS deps
RUN --mount=type=cache,target=/cache \
    --mount=type=bind,source=bun.lock,target=bun.lock \
    --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=backend/package.json,target=backend/package.json \
    --mount=type=bind,source=frontend/package.json,target=frontend/package.json \
    --mount=type=bind,source=docs/package.json,target=docs/package.json \
    BUN_INSTALL_CACHE_DIR=/cache \
    bun install --frozen-lockfile --filter "!nexus-gate-docs"

FROM deps AS builder
COPY . .
RUN cd backend && bun build src/index.ts --target bun --outdir out/

FROM base AS runner 
ARG COMMIT_SHA
ENV COMMIT_SHA=${COMMIT_SHA}
COPY --from=builder /app/backend/out/index.js /app/index.js
COPY --from=builder /app/backend/drizzle /app/drizzle
USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", "index.js" ]