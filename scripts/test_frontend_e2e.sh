#!/usr/bin/env bash
#
# Real frontend end-to-end: drives the deployed UI with a headless browser and
# an injected EIP-1193 wallet (depositor on Sepolia, claimer on QIE). Exercises
# connect -> deposit -> auto-relay -> shielded claim against the live site.
#
# Usage:  scripts/test_frontend_e2e.sh                     # live prod
#         BASE_URL=http://localhost:3000 scripts/test_frontend_e2e.sh
#
# Reads DEPOSITOR_PRIVATE_KEY, CLAIMER_PRIVATE_KEY, SOURCE_RPC_URL, QIE_RPC_URL
# from ./.env. Those accounts must be funded (Sepolia ETH + QIE gas).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
[ -f .env ] || { echo "FATAL: ./.env not found"; exit 1; }
set -a; . ./.env; set +a

export BASE_URL="${BASE_URL:-https://veilbridge.vercel.app}"
# wallet.ts reads SEPOLIA_RPC_URL/QIE_RPC_URL; mirror from the .env names.
export SEPOLIA_RPC_URL="${SEPOLIA_RPC_URL:-$SOURCE_RPC_URL}"
export QIE_RPC_URL="${QIE_RPC_URL}"

cd frontend
[ -d node_modules/@playwright/test ] || npm install
npx playwright install chromium >/dev/null 2>&1 || npx playwright install chromium
echo "==> Running frontend E2E against $BASE_URL"
npx playwright test
