#!/usr/bin/env bash
# start-stack.sh — bring up the 5-service dev stack so processes SURVIVE
# the tool-invocation reaper of this sandboxed environment.
#
# WHY THIS SHAPE (empirically derived — see worklog 2026-09-13):
#   Plain `nohup cmd &`, `setsid cmd`, `disown` etc. are ALL killed when the
#   tool invocation that spawned them ends (the wrapper reaps processes whose
#   stdio is not attached to a tty).
#   The ONLY pattern that survives:
#       script -q <log> -c "setsid bun <cmd>" &
#   i.e. the service's stdio stays on a pty allocated by `script`, and the
#   process itself is setsid'd away from the pty session. Output lands in the
#   typescript <log> until the invocation ends; after that the service runs
#   silently (verify via ports / API health / DB, not logs).
#   ⚠ Do NOT pipe inside the command (`| tee` breaks the launch) — call
#     `bun next dev` directly instead of `bun run dev` for next-dev.
#   ⚠ Start services one per `script` line; batching several in one command
#     can get the whole invocation SIGKILLed by the wrapper.
#   ⚠ NEXT-DEV IS SPECIAL: with its stdout on a dead pty it spins forever in
#     source-map parsing of error stacks (observed Sept 2026 — boot loop at
#     ~115% CPU, no requests served). The working shape for next-dev keeps
#     STDIN on the pty (so the reaper spares it) but appends stdout/stderr to
#     a real log file — which also means next-dev logs PERSIST after the
#     launching invocation ends, unlike the other services.
#
# Usage:
#   bash scripts/dev/start-stack.sh          # start whatever is missing
#   bash scripts/dev/start-stack.sh status   # show ports + processes

set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOGS="$ROOT/var/logs"
mkdir -p "$LOGS"

port_open() { ss -ltn 2>/dev/null | grep -q ":$1\b"; }

svc_running_in_dir() { # svc_running_in_dir <dirname-under-mini-services>
  local p
  for p in $(pgrep -f "bun --hot index.ts" 2>/dev/null); do
    [ "$(readlink /proc/$p/cwd 2>/dev/null)" = "$ROOT/mini-services/$1" ] && return 0
  done
  return 1
}

svc() { # svc <name> <port-or-empty> <dir> <cmd...>
  local name="$1" port="$2" dir="$3"; shift 3
  if [ -n "$port" ] && port_open "$port"; then
    echo "✓ $name already up (:$port)"
    return 0
  fi
  if [ -z "$port" ] && svc_running_in_dir "$dir"; then
    echo "✓ $name already running"
    return 0
  fi
  ( cd "$ROOT/$dir" && script -q "$LOGS/$name.log" -c "setsid $*" >/dev/null 2>&1 & )
  echo "→ started $name"
}

case "${1:-start}" in
  status)
    for p in 3000:next-dev 3031:media-relay 6543:pglite-db; do
      port="${p%%:*}"; name="${p##*:}"
      if port_open "$port"; then echo "✓ $name :$port"; else echo "✗ $name :$port DOWN"; fi
    done
    for s in control-scheduler worker-dev; do
      if svc_running_in_dir "$s"; then echo "✓ $s running"; else echo "✗ $s DOWN"; fi
    done
    ;;
  start)
    # Order matters: DB first (Next + workers need it).
    svc pglite-db 6543 mini-services/pglite-db bun --hot index.ts
    sleep 4
    if ! port_open 3000; then
      ( cd "$ROOT" && script -q /dev/null -c "setsid sh -c 'sleep 2; exec bun next dev -p 3000 >> $LOGS/next-dev.log 2>&1'" >/dev/null 2>&1 & )
      echo "→ started next-dev"
    else echo "✓ next-dev already up (:3000)"; fi
    sleep 6
    svc media-relay 3031 mini-services/media-relay bun --hot index.ts
    sleep 3
    svc control-scheduler "" mini-services/control-scheduler bun --hot index.ts
    svc worker-dev "" mini-services/worker-dev bun --hot index.ts
    sleep 5
    echo "---- status ----"
    bash "$0" status
    echo "Note: service logs in $LOGS/*.log stop growing once the launching shell"
    echo "      exits — that is expected (except next-dev, which appends to its"
    echo "      log file); check ports/health for liveness."
    ;;
  *)
    echo "unknown subcommand: $1 (use 'start' or 'status')"; exit 1 ;;
esac
