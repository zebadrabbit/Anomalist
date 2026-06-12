#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

URL="${ANOMALIST_URL:-http://localhost:3001}"
USER_NAME="${ANOMALIST_USER:-}"
PASSWORD="${ANOMALIST_PASS:-}"

if [[ -z "$USER_NAME" || -z "$PASSWORD" ]]; then
  echo "Usage: ANOMALIST_USER=<user> ANOMALIST_PASS=<pass> [ANOMALIST_URL=http://localhost:3001] npm run docs:screenshots:local"
  exit 1
fi

if ! curl -fsS "$URL" >/dev/null; then
  echo "Anomalist is not reachable at $URL"
  echo "Start it first, then retry."
  exit 1
fi

# Install Playwright Chromium on first run (safe to repeat).
if [[ "${SKIP_PLAYWRIGHT_INSTALL:-0}" != "1" ]]; then
  (cd docs && npx playwright install chromium)
fi

ANOMALIST_URL="$URL" ANOMALIST_USER="$USER_NAME" ANOMALIST_PASS="$PASSWORD" npm run docs:screenshots

echo "Screenshots updated in docs/public/screenshots"
