# syntax=docker/dockerfile:1

# Multi-stage build. Build context is the repo root (a monorepo), not
# apps/web, so packages/shared and the npm workspace lockfile are reachable:
#   docker build -f apps/web/Dockerfile \
#     --build-arg AUTH0_DOMAIN=... --build-arg AUTH0_CLIENT_ID=... \
#     --build-arg AUTH0_AUDIENCE=... .

FROM node:22.22.3-bookworm-slim AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY apps/web apps/web

# scripts/generate-environment.cjs (run automatically by the `prebuild` npm
# hook) reads these from process.env and bakes them into the JS bundle. Not
# secrets — this is a public SPA client, same as the comment in that script.
ARG AUTH0_DOMAIN
ARG AUTH0_CLIENT_ID
ARG AUTH0_AUDIENCE
ENV AUTH0_DOMAIN=$AUTH0_DOMAIN \
    AUTH0_CLIENT_ID=$AUTH0_CLIENT_ID \
    AUTH0_AUDIENCE=$AUTH0_AUDIENCE

RUN npm run build --workspace @frntdesk/shared
RUN npm run build --workspace @frntdesk/web

# No SSR (confirmed: no @angular/ssr dependency) — plain static SPA output,
# so a static file server is all the runtime stage needs.
FROM nginxinc/nginx-unprivileged:alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 8080
