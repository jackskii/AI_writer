#!/usr/bin/env bash
# One-click: serve AI Writer on the local Wi-Fi at port 3000.
# Stable name on every network: http://aiwriter.local:3000
set -euo pipefail

cd "$(dirname "$0")"

FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-8001}"
LAN_NAME="${LAN_NAME:-aiwriter.local}"
PID_FILE="/tmp/aiwriter-avahi.pid"

lan_ip() {
  ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}' \
    || hostname -I 2>/dev/null | awk '{print $1}' \
    || true
}

IP="$(lan_ip)"
if [ -z "${IP}" ]; then
  echo "Could not detect a LAN IP. Are you on Wi-Fi?"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker, then run this script again."
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx novel_ai_frontend; then
  echo "Stack is not up. Starting with start.sh..."
  bash ./start.sh
else
  echo "Frontend already running. Making sure :${FRONTEND_PORT} is on 0.0.0.0..."
  docker stop novel_ai_frontend >/dev/null
  docker rm novel_ai_frontend >/dev/null
  docker run -d \
    --name novel_ai_frontend \
    --network novel_ai_network \
    -p "0.0.0.0:${FRONTEND_PORT}:80" \
    --restart unless-stopped \
    novel_ai_frontend >/dev/null
fi

if [ -f "${PID_FILE}" ]; then
  old_pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if [ -n "${old_pid}" ]; then
    kill "${old_pid}" 2>/dev/null || true
  fi
  rm -f "${PID_FILE}"
fi

if command -v avahi-publish >/dev/null 2>&1; then
  if ! systemctl is-active --quiet avahi-daemon 2>/dev/null; then
    sudo systemctl start avahi-daemon 2>/dev/null || true
  fi
  nohup avahi-publish -a -R "${LAN_NAME}" "${IP}" >/tmp/aiwriter-avahi.log 2>&1 &
  echo $! > "${PID_FILE}"
  echo "Published ${LAN_NAME} -> ${IP}"
else
  echo "avahi-publish not found. Install avahi-utils for the stable name."
fi

echo ""
echo "Always use this (any Wi-Fi):  http://${LAN_NAME}:${FRONTEND_PORT}"
echo "This network's IP (changes):  http://${IP}:${FRONTEND_PORT}"
echo "This machine:                 http://127.0.0.1:${FRONTEND_PORT}"
echo ""
echo "Phone must be on the same Wi-Fi. iPhone/Android both resolve .local."
echo "Stop with: ./stop.sh"
