# syntax=docker/dockerfile:1

# Multi-stage build. Build context is the repo root (a monorepo), not
# apps/api, so packages/shared and the npm workspace lockfile are reachable:
#   docker build -f apps/api/Dockerfile .

FROM node:22.22.3-bookworm-slim AS builder
WORKDIR /repo

# Manifests only first, so `npm ci` is cached across builds that only touch
# source. npm workspaces needs every workspace's package.json present (even
# ones this image doesn't ship) to resolve correctly against the root
# lockfile.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY apps/api apps/api

# @frntdesk/shared is imported from its built dist/, not source — same as CI.
RUN npm run build --workspace @frntdesk/shared

# prisma.config.ts's env('DATABASE_URL') is resolved at config-load time even
# for `generate` (which never actually connects); this placeholder just keeps
# that resolution from failing in an environment with no real DB yet.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"

# Needed before `nest build`: PrismaService imports the generated client's
# types.
RUN npm run db:generate --workspace @frntdesk/api
RUN npm run build --workspace @frntdesk/api

FROM node:22.22.3-bookworm-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production

# Prisma's query engine binary needs libssl even on Debian slim.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Whole-workspace node_modules, not a per-app prune: simpler and less fragile
# than fighting npm's partial-workspace install, at the cost of also carrying
# apps/web's prod deps in this image. Revisit only if image size matters.
COPY --from=builder --chown=node:node /repo/node_modules ./node_modules
COPY --from=builder --chown=node:node /repo/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=node:node /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=node:node /repo/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /repo/apps/api/package.json ./apps/api/package.json

USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
