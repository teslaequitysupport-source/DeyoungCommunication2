#!/usr/bin/env bash
# Dev server watchdog: keep next dev alive under the container's 4GB cap.
# - Caps the Node heap at 1024MB (next-server OOMed at ~2.5GB RSS before)
# - Restarts the server if the port stops answering, with a log line
set -u
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=1024"

LOG=/tmp/next-dev.log
PORT=3000

alive() {
  curl -s -o /dev/null -m 5 -w "%{http_code}" "http://127.0.0.1:${PORT}/" | grep -q "^2\|^3"
}

start() {
  echo "[watchdog $(date '+%H:%M:%S')] starting bun run dev" >> "$LOG"
  nohup bun run dev >> "$LOG" 2>&1 &
  echo $! > /tmp/next-dev.pid
}

mkdir -p /tmp
start
while true; do
  sleep 15
  if ! alive; then
    # one grace probe: the server may be mid-compile
    sleep 10
    if ! alive; then
      echo "[watchdog $(date '+%H:%M:%S')] server down, restarting" >> "$LOG"
      OLD=$(cat /tmp/next-dev.pid 2>/dev/null || true)
      if [ -n "${OLD:-}" ] && kill -0 "$OLD" 2>/dev/null; then
        kill "$OLD" 2>/dev/null || true
        sleep 2
      fi
      pkill -f "next-server" 2>/dev/null || true
      start
    fi
  fi
done
