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

FROM deps AS builder-common
COPY . .

FROM builder-common AS builder-backend
RUN cd backend && bun run build

FROM builder-common AS builder-frontend
ENV VITE_BASE_URL=/ VITE_COMMIT_SHA=${COMMIT_SHA}
RUN cd frontend && bun run build

FROM base AS runner 
ARG COMMIT_SHA
ENV COMMIT_SHA=${COMMIT_SHA}
COPY --from=builder-backend /app/backend/out/index.js /app/index.js
COPY --from=builder-backend /app/backend/drizzle /app/drizzle
COPY --from=builder-frontend /app/frontend/dist /app/dist

USER bun
EXPOSE 3000/tcp

ENTRYPOINT [ "bun", "run", "index.js" ]