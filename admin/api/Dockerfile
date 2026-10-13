# syntax=docker/dockerfile:1

# `gcloud run deploy --source admin/api` builds this file when it is present
# (buildpacks otherwise). A Dockerfile over buildpacks because it pins what
# runs: Node 22 from the official slim image, production dependencies only,
# a non-root user, and nothing that a buildpack would have to guess from
# `engines`. The image is a few tens of MB and builds in under a minute.

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
USER node
# Cloud Run injects PORT; 8080 is the default `config.mjs` falls back to.
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/server.mjs"]
