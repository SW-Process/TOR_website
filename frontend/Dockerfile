# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- deps: full install ----
FROM base AS deps
# Next's SWC / Turbopack binaries expect glibc symbols on alpine.
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# ---- dev: Next dev server for `docker compose` ----
FROM deps AS dev
COPY . .
EXPOSE 3000
# `npm ci` on start rebuilds the node_modules volume for this container's
# platform (the volume persists across `up --build` and can go stale after a
# dependency change). --prefer-offline keeps it fast via the mounted npm cache.
CMD ["sh", "-c", "npm ci --prefer-offline --no-audit && npm run dev -- -H 0.0.0.0"]

# ---- build: produce the standalone production bundle ----
FROM deps AS build
# NEXT_PUBLIC_* is inlined at build time — pass the real backend URL here for
# production images (the dev target reads it from the environment at runtime).
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY . .
RUN npm run build

# ---- runner: minimal production image (needs `output: "standalone"`) ----
FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
