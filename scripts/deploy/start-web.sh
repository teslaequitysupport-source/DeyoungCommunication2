#!/bin/sh
# start-web.sh — container entrypoint for the Deyoung Live web service.
#
#   1. Apply database migrations (idempotent — Drizzle tracks applied
#      migrations in the schema table; safe on every boot, and multiple
#      app replicas should let one apply first or use Railway's
#      release-phase equivalent).
#   2. Exec the Next.js standalone server. PORT and HOSTNAME come from
#      the environment (Railway sets PORT automatically).
#
# Required environment (see .env.example for the full contract):
#   DATABASE_URL   — Railway Postgres (internal URL works without sslmode;
#                    the external URL's ?sslmode=require is honored too)
#   AUTH_SECRET    — Better Auth session signing key
#   BETTER_AUTH_URL — public origin of this deployment
#   TRUSTED_ORIGINS — allowed auth origins (comma-separated)
#   STORAGE_TICKET_SECRET, REALTIME_TICKET_SECRET, SCHEDULER_TOKEN —
#                    service tickets (openssl rand -hex 32 each)
set -e

echo "[deploy] applying database migrations…"
bun scripts/db/migrate.ts

echo "[deploy] starting web server on port ${PORT:-3000}…"
exec bun server.js
