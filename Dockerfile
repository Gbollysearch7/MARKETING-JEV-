# syntax=docker/dockerfile:1.7
# Rankcall production image: Next.js standalone server + better-sqlite3 + Litestream backups.
# Build:  docker build -t rankcall .
# Run:    docker run -p 3000:3000 -v rankcall-data:/data --env-file .env.production rankcall

ARG NODE_VERSION=22
ARG LITESTREAM_VERSION=0.5.16

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- deps: full install (dev deps are needed to build); toolchain for the native SQLite module
FROM base AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
# Fail here, not at runtime, if better-sqlite3 did not install or compile for this platform.
RUN node -e "new (require('better-sqlite3'))(':memory:').prepare('select 1').get()"

# ---- builder: next build with output: 'standalone'
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN npx next build \
 # src/lib/db.ts resolves the data folder at runtime, so the tracer copies the whole project into
 # standalone/. The server needs none of it; drop it (data/, .env* and test/ are already excluded by .dockerignore).
 && cd .next/standalone && rm -rf src test scripts docs integrations data samples *.md Dockerfile fly.toml litestream.yml tsconfig*.json eslint.config.mjs

# ---- litestream: pinned release, checksum verified
FROM base AS litestream
ARG LITESTREAM_VERSION
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in amd64) arch=x86_64 ;; arm64) arch=arm64 ;; *) echo "unsupported arch ${TARGETARCH}"; exit 1 ;; esac; \
    file="litestream-${LITESTREAM_VERSION}-linux-${arch}.tar.gz"; \
    base="https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}"; \
    cd /tmp; curl -fsSLO "$base/$file"; curl -fsSLO "$base/checksums.txt"; \
    grep " $file\$" checksums.txt | sha256sum -c -; \
    tar -xzf "$file" litestream; install -m 0755 litestream /usr/local/bin/litestream; \
    /usr/local/bin/litestream version

# ---- runner: small image, app runs as the unprivileged "node" user
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data
# CA certificates for Litestream's HTTPS calls to the bucket.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Sample CSVs are read at runtime ("Load sample data") from process.cwd()/samples.
COPY --from=builder --chown=node:node /app/samples ./samples
# The WordPress plugin is zipped on request from process.cwd()/integrations (Quality gate > Integrations).
COPY --from=builder --chown=node:node /app/integrations/wordpress ./integrations/wordpress
# The native module exactly as compiled in deps, in case file tracing missed its .node binary.
COPY --from=deps --chown=node:node /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY litestream.yml /etc/litestream.yml
COPY --chmod=0755 scripts/start.sh /usr/local/bin/start.sh
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# start.sh starts as root only to chown the volume, then drops to "node" (setpriv) before running anything else.
ENTRYPOINT ["/usr/local/bin/start.sh"]
