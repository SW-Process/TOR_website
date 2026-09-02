# syntax=docker/dockerfile:1
# Multi-stage build for the TOR backend (Cloud Run service + jobs share this image).
# The CMD is overridden per Cloud Run resource via --command / --args.

FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
CMD ["node", "dist/server.js"]
