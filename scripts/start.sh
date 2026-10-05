#!/usr/bin/env bash
#
# Start the app with Docker Compose, auto-advertising this machine's LAN IP so
# other devices on your home network can connect.
#
# A container can't see the host's real LAN IP, so we detect it here on the host
# and pass it into the container via LAN_HOST. The server prints a ready-to-share
# "On your network" URL in its startup logs.
#
# Usage:
#   ./scripts/start.sh                 # build + start in the foreground (Ctrl-C to stop)
#   ./scripts/start.sh -d              # build + start detached (background)
#   APP_PORT=8080 ./scripts/start.sh   # use a custom host port
#   LAN_HOST=10.0.0.5 ./scripts/start.sh   # override auto-detection
#
# Any extra arguments are forwarded to `docker compose up`.

set -euo pipefail

# Run from the repo root regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# ─── Detect the host LAN IP ──────────────────────────────────────────────────
# Honor an explicit LAN_HOST if the caller already set one; otherwise try to
# find the primary LAN address. On macOS, ask the active interface (en0 Wi-Fi,
# then en1 as a fallback for Ethernet); on Linux, take the first `hostname -I`.
detect_lan_ip() {
  local ip=""

  if command -v ipconfig >/dev/null 2>&1; then
    # macOS: query common interfaces in order until one yields an address.
    for iface in en0 en1 en2; do
      ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
      [ -n "$ip" ] && break
    done
  fi

  if [ -z "$ip" ] && command -v hostname >/dev/null 2>&1; then
    # Linux: hostname -I lists all addresses; take the first.
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi

  printf '%s' "$ip"
}

LAN_HOST="${LAN_HOST:-$(detect_lan_ip)}"
export LAN_HOST

APP_PORT="${APP_PORT:-3000}"
export APP_PORT

if [ -n "$LAN_HOST" ]; then
  echo "🌐 LAN_HOST detected: http://${LAN_HOST}:${APP_PORT}  (share this with devices on your network)"
else
  echo "⚠️  Could not detect a LAN IP. The app will still start; set LAN_HOST manually to advertise a shareable URL:"
  echo "    LAN_HOST=192.168.x.x ./scripts/start.sh"
fi

# ─── Launch ──────────────────────────────────────────────────────────────────
echo "🐳 Starting with Docker Compose (APP_PORT=${APP_PORT})..."
exec docker compose up -d --build "$@"
