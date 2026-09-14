#!/usr/bin/env bash
# recover-dev-env.sh — rebuild the local dev environment after a sandbox
# reset (untracked dev secrets + PGlite data dir get wiped).
#
# Subcommands (run EACH in its own tool invocation — the sandbox reaper
# nondeterministically kills batched service launches; see start-stack.sh
# header notes — empirically one launch per invocation is reliable):
#
#   env        generate secrets + write all .env files (root + mini-services)
#   stop       kill every stack service, wait until ports are released
#   start X    start ONE service and verify its port (pglite|next|relay|scheduler|worker)
#   migrate    apply drizzle migrations + provision the dev worker identity
#   status     show the full stack status
#
# Typical recovery sequence (one tool call each):
#   bash scripts/dev/recover-dev-env.sh env
#   bash scripts/dev/recover-dev-env.sh stop
#   bash scripts/dev/recover-dev-env.sh start pglite
#   bash scripts/dev/recover-dev-env.sh migrate
#   bash scripts/dev/recover-dev-env.sh start next
#   bash scripts/dev/recover-dev-env.sh start relay
#   bash scripts/dev/recover-dev-env.sh start scheduler
#   bash scripts/dev/recover-dev-env.sh start worker
#   bash scripts/dev/recover-dev-env.sh status
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOGS="$ROOT/var/logs"
SECRETS="$ROOT/var/dev-secrets.env"
mkdir -p "$LOGS" "$ROOT/var" "$ROOT/db"

port_open() { ss -ltn 2>/dev/null | grep -q ":$1\b"; }
svc_running_in_dir() { # svc_running_in_dir <dirname-under-mini-services>
  local p
  for p in $(pgrep -f "bun --hot index.ts" 2>/dev/null); do
    [ "$(readlink /proc/$p/cwd 2>/dev/null)" = "$ROOT/mini-services/$1" ] && return 0
  done
  return 1
}

cmd_env() {
  if [ ! -f "$SECRETS" ]; then
    umask 077
    {
      echo "AUTH_SECRET=$(openssl rand -hex 32)"
      echo "STORAGE_TICKET_SECRET=$(openssl rand -hex 32)"
      echo "REALTIME_TICKET_SECRET=$(openssl rand -hex 32)"
      echo "SCHEDULER_TOKEN=$(openssl rand -hex 32)"
      echo "WORKER_CREDENTIAL=$(openssl rand -hex 32)"
    } > "$SECRETS"
    chmod 600 "$SECRETS"
    echo "[recover] generated fresh dev secrets -> var/dev-secrets.env (chmod 600)"
  fi
  # shellcheck disable=SC1090
  set -a; source "$SECRETS"; set +a

  cat > "$ROOT/.env" <<EOF
# ═══ dev environment (rebuilt $(date +%F) — see scripts/dev/recover-dev-env.sh) ═══
NEXT_PUBLIC_APP_URL=http://localhost:3000
AUTH_SECRET=$AUTH_SECRET
BETTER_AUTH_URL=http://localhost:3000
TRUSTED_ORIGINS=http://localhost:3000

# pglite-db mini service (embedded Postgres on the wire protocol)
DATABASE_URL=postgresql://127.0.0.1:6543/postgres

# local-dev object store (ticketed server uploads)
STORAGE_TICKET_SECRET=$STORAGE_TICKET_SECRET

# media-relay dev transport tickets (same value in mini-services/media-relay/.env)
REALTIME_TICKET_SECRET=$REALTIME_TICKET_SECRET

# control-scheduler daemon token (same value in mini-services/control-scheduler/.env)
SCHEDULER_TOKEN=$SCHEDULER_TOKEN

# dev worker identity (same values in mini-services/worker-dev/.env)
WORKER_ID=
WORKER_NAME=dev-worker-1
WORKER_PROVIDER=DEVELOPMENT_LOCAL
WORKER_CREDENTIAL=$WORKER_CREDENTIAL
CONTROL_PLANE_URL=http://127.0.0.1:3000
MEDIA_RELAY_URL=http://127.0.0.1:3031

# compute sleep (default 2 min; shorten for demos)
WORKER_IDLE_SLEEP_MS=120000

# credits
SIGNUP_BONUS_CREDITS=100
EOF

  cat > "$ROOT/mini-services/media-relay/.env" <<EOF
REALTIME_TICKET_SECRET=$REALTIME_TICKET_SECRET
DATABASE_URL=postgresql://127.0.0.1:6543/postgres
EOF
  cat > "$ROOT/mini-services/control-scheduler/.env" <<EOF
SCHEDULER_TOKEN=$SCHEDULER_TOKEN
CONTROL_PLANE_URL=http://127.0.0.1:3000
EOF
  cat > "$ROOT/mini-services/worker-dev/.env" <<EOF
WORKER_NAME=dev-worker-1
WORKER_CREDENTIAL=$WORKER_CREDENTIAL
WORKER_PROVIDER=DEVELOPMENT_LOCAL
CONTROL_PLANE_URL=http://127.0.0.1:3000
MEDIA_RELAY_URL=http://127.0.0.1:3031
EOF
  echo "[recover] wrote root .env + mini-service .env files (all gitignored)"
}

cmd_stop() {
  local p
  for p in $(pgrep -f "bun --hot index.ts" 2>/dev/null || true); do
    kill "$p" 2>/dev/null || true
  done
  pkill -f "bun next dev" 2>/dev/null || true
  # Wait for graceful shutdowns (PGlite flushes its WASM fs on SIGTERM — takes
  # seconds). If we start a new instance while the port is still open it
  # exits as a "duplicate" right before the old one finishes dying.
  for i in $(seq 1 25); do
    if ! port_open 6543 && ! port_open 3000 && ! port_open 3031 \
       && [ -z "$(pgrep -f 'bun --hot index.ts' 2>/dev/null || true)" ]; then
      echo "[recover] all stack ports released"
      return 0
    fi
    sleep 1
  done
  echo "[recover] WARNING: some ports/processes did not clear — check status"
  return 1
}

wait_port() { # wait_port <port> <timeout-s> <name>
  local port="$1" tmo="$2" name="$3" i
  for i in $(seq 1 "$tmo"); do port_open "$port" && { echo "✓ $name up (:$port)"; return 0; }; sleep 1; done
  echo "✗ $name FAILED to come up on :$port" >&2
  return 1
}

# launch_svc <dir-under-mini-services> <logfile-name> — the ROBUST launch
# pattern (empirically required since the 2026-09-14 sandbox update): the
# service's stdin stays on script's pty (reaper spares it) but stdout/stderr
# append to a real log file. The old "typescript to log" shape
#   script -q LOG -c "setsid bun --hot index.ts"
# now gets the service SIGKILLed nondeterministically minutes in.
launch_svc() { # launch_svc <svc-dir> <log-name>
  local dir="$1" log="$2"
  ( cd "$ROOT/mini-services/$dir" && script -q /dev/null \
      -c "setsid sh -c 'sleep 1; exec bun --hot index.ts >> $LOGS/$log 2>&1'" \
      >/dev/null 2>&1 & )
}

cmd_start() {
  case "${1:-}" in
    pglite)
      port_open 6543 && { echo "✓ pglite-db already up (:6543)"; return 0; }
      launch_svc pglite-db pglite-db.log
      wait_port 6543 25 pglite-db ;;
    next)
      port_open 3000 && { echo "✓ next-dev already up (:3000)"; return 0; }
      ( cd "$ROOT" && script -q /dev/null -c "setsid sh -c 'sleep 2; exec bun next dev -p 3000 >> $LOGS/next-dev.log 2>&1'" >/dev/null 2>&1 & )
      wait_port 3000 40 next-dev ;;
    relay)
      port_open 3031 && { echo "✓ media-relay already up (:3031)"; return 0; }
      launch_svc media-relay media-relay.log
      wait_port 3031 20 media-relay ;;
    scheduler)
      svc_running_in_dir control-scheduler && { echo "✓ control-scheduler already running"; return 0; }
      launch_svc control-scheduler control-scheduler.log
      sleep 4
      svc_running_in_dir control-scheduler && echo "✓ control-scheduler running" || { echo "✗ control-scheduler FAILED"; return 1; } ;;
    worker)
      svc_running_in_dir worker-dev && { echo "✓ worker-dev already running"; return 0; }
      launch_svc worker-dev worker-dev.log
      sleep 4
      svc_running_in_dir worker-dev && echo "✓ worker-dev running" || { echo "✗ worker-dev FAILED"; return 1; } ;;
    *) echo "usage: recover-dev-env.sh start (pglite|next|relay|scheduler|worker)"; exit 1 ;;
  esac
}

cmd_migrate() {
  port_open 6543 || { echo "✗ pglite-db is not running — start it first"; exit 1; }
  cd "$ROOT" && bun run scripts/db/migrate.ts 2>&1 | tail -2
  # shellcheck disable=SC1090
  source "$SECRETS"
  echo "[recover] provisioning dev worker identity..."
  WORKER_NAME=dev-worker-1 WORKER_CREDENTIAL="$WORKER_CREDENTIAL" \
    bun run scripts/db/provision-worker.ts 2>&1 | tail -2
}

case "${1:-help}" in
  env) cmd_env ;;
  stop) cmd_stop ;;
  start) shift; cmd_start "$@" ;;
  migrate) cmd_migrate ;;
  status) bash "$ROOT/scripts/dev/start-stack.sh" status ;;
  *) sed -n '2,25p' "$0"; exit 1 ;;
esac
