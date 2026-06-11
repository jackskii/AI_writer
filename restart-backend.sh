#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

REBUILD=false
if [ "${1:-}" = "--rebuild" ]; then
  REBUILD=true
fi

if [ "$REBUILD" = true ]; then
  echo "Rebuilding backend image..."
  docker build -t novel_ai_backend ./backend
fi

docker restart novel_ai_backend
echo "Backend restarted."
