#!/usr/bin/env bash
# Start Redis (if needed) and the SyncScript signaling server with Redis persistence.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REDIS_URL="${REDIS_URL:-redis://localhost:6379}"

redis_ready() {
  if command -v redis-cli >/dev/null 2>&1; then
    redis-cli -u "$REDIS_URL" ping 2>/dev/null | grep -q PONG && return 0
  fi
  return 1
}

if ! redis_ready; then
  echo "Starting Redis..."
  if command -v docker >/dev/null 2>&1 && [ -f docker-compose.yml ]; then
    docker compose up -d redis
    for _ in $(seq 1 30); do
      redis_ready && break
      sleep 1
    done
  elif command -v redis-server >/dev/null 2>&1; then
    redis-server --daemonize yes --port 6379
    sleep 1
  else
    echo "WARNING: Redis not found. Signaling will use in-memory mode."
    unset REDIS_URL
  fi
fi

if redis_ready; then
  echo "Redis: $REDIS_URL"
  export REDIS_URL
else
  echo "Running without Redis (in-memory mode)."
  unset REDIS_URL
fi

export PORT="${PORT:-4444}"
export REDIS_KEY_PREFIX="${REDIS_KEY_PREFIX:-syncscript}"
export METRICS_ENABLED="${METRICS_ENABLED:-true}"

echo "Building signaling server..."
npm run build --workspace signaling

echo "Starting signaling on port $PORT..."
exec npm run start:prod --workspace signaling
