# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage
#
# The whole repo is copied in because `npm run build` runs `tsc --noEmit` first,
# and tsconfig.json includes `tests` and `playwright.config.ts`. Type errors
# should fail the image build, not turn up after a deploy.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Dependencies first: this layer is cached until the lockfile actually changes.
# `npm ci` installs devDependencies too, which the build needs (vite, tsc).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage
#
# Static files only - the game has no server side. Nginx serves `dist` and
# nothing else; the build stage and its ~300 MB of node_modules are discarded.
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# Headers shared by every location block. They go in `snippets` rather than
# `conf.d` because the main nginx.conf globs conf.d/*.conf into the http
# context, and this file is meant to be included by hand, once per location.
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY docker/default.conf /etc/nginx/conf.d/default.conf

# The base image ships its own index.html and a 50x.html in the webroot. Ours
# replaces the index, but the rest would linger and be publicly reachable, so
# the directory is emptied first.
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist /usr/share/nginx/html

# Coolify reads this to prefill the port; override it there if you prefer another.
EXPOSE 80

# Plain wget, already in the busybox base. Coolify shows the result in the UI.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
