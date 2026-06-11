#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

VITE_API_URL="${VITE_API_URL:-/api}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

echo "Building frontend (VITE_API_URL=$VITE_API_URL)..."
docker build -t novel_ai_frontend --build-arg "VITE_API_URL=$VITE_API_URL" ./frontend

docker rm -f novel_ai_frontend 2>/dev/null || true

docker run -d \
  --name novel_ai_frontend \
  --network novel_ai_network \
  -p "${FRONTEND_PORT}:80" \
  --restart unless-stopped \
  novel_ai_frontend

echo "Frontend restarted at http://0.0.0.0:${FRONTEND_PORT}"
