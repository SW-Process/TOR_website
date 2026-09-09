# syntax=docker/dockerfile:1

# Debian slim (not alpine): bcrypt installs a glibc prebuild here; the deps
# stage also carries a toolchain in case a native dep must compile.
FROM node:22-bookworm-slim AS base
WORKDIR /app

# ---- deps: full install (+ build toolchain for native modules like bcrypt) ----
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- dev: hot-reloading server for `docker compose` ----
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 8000
# `npm ci` on start rebuilds the node_modules volume for this container's
# platform (the volume persists across `up --build` and can go stale after a
# dependency change). --prefer-offline keeps it fast via the mounted npm cache.
CMD ["sh", "-c", "npm ci --prefer-offline --no-audit && npm run dev"]

# ---- build: compile TypeScript to dist/ ----
FROM deps AS build
COPY . .
RUN npm run build

# ---- prod-deps: drop devDependencies, keep compiled native binaries ----
FROM deps AS prod-deps
RUN npm prune --omit=dev && npm cache clean --force

# ---- runner: production image, no toolchain, non-root ----
FROM base AS runner
ENV NODE_ENV=production
RUN mkdir -p /app/storage && chown -R node:node /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 8000
CMD ["node", "dist/server.js"]
