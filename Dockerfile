# ═══════════════════════════════════════════════════════════════════════════
# Deyoung Live — production image (Railway / any Docker host)
#
#   Stage 1 (deps)    — install dependencies with Bun from the lockfile
#   Stage 2 (builder) — `next build` (standalone output) + static assets
#   Stage 3 (runner)  — lean runtime: standalone server + migrations
#
# The container starts via scripts/deploy/start-web.sh:
#   1. applies Drizzle migrations to DATABASE_URL (idempotent)
#   2. execs the Next.js standalone server (respects PORT / HOSTNAME)
# Health: GET /api/health  (configured in railway.json)
# ═══════════════════════════════════════════════════════════════════════════

FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time placeholders — the real values are injected at runtime.
# AUTH_SECRET is required for the auth routes to be statically analyzed.
RUN bun run build

FROM oven/bun:1.3 AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Standalone server + its traced node_modules (pg, drizzle-orm included)
COPY --from=builder /app/.next/standalone ./
# Static assets & public files into the standalone root
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Migration machinery: SQL + script + its manifest
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/db/migrate.ts ./scripts/db/migrate.ts
COPY --from=builder /app/scripts/deploy/start-web.sh ./scripts/deploy/start-web.sh

RUN chmod +x scripts/deploy/start-web.sh

EXPOSE 3000
CMD ["sh", "scripts/deploy/start-web.sh"]
