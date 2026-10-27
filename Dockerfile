# syntax=docker/dockerfile:1.7
# Multi-stage image for self-hosting. Stages:
#   deps     installs every dependency (cached on package-lock.json)
#   builder  generates the Prisma client and builds Next in standalone mode
#   migrate  full toolchain for `prisma migrate deploy` and the seed (docker-compose's init job)
#   runner   the lean production server: standalone output, non-root, no dev dependencies
ARG NODE_VERSION=22-bookworm-slim

FROM node:${NODE_VERSION} AS base
# Prisma's engines need OpenSSL; ca-certificates for Stripe, Resend and S3 over HTTPS.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Real configuration arrives at run time; validation runs again when the server boots.
ENV SKIP_ENV_VALIDATION=1 NEXT_OUTPUT=standalone
RUN npx prisma generate && npm run build

FROM builder AS migrate
ENV SKIP_ENV_VALIDATION=
CMD ["node", "scripts/docker-init.mjs"]

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Local-disk uploads and site exports live here; mount volumes over them.
RUN mkdir -p public/uploads storage/exports && chown -R nextjs:nodejs public/uploads storage
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
