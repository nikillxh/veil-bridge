#!/usr/bin/env bash
#
# End-to-end test against the LIVE testnets using the addresses in ./.env:
#   deposit on Sepolia -> relayer bridges the vault root to QIE -> shielded
#   claim from the CLAIMER wallet -> assert wrapped tokens were minted.
#
# Prereqs: scripts/deploy_testnet.sh has populated ./.env with addresses, and
# MAIN (depositor/relayer) + CLAIMER are funded.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
set -a; . ./.env; set +a

: "${VAULT_ADDRESS:?run deploy_testnet.sh first}"
: "${POOL_ADDRESS:?run deploy_testnet.sh first}"
START_BLOCK="${VAULT_DEPLOY_BLOCK:-0}"

DENOM="${DENOMINATION:-1000000000000000000}"
TOKEN="${TOKEN_ADDRESS:-0x0000000000000000000000000000000000000000}"
if [ "$TOKEN" != "0x0000000000000000000000000000000000000000" ]; then
  echo "==> [0/4] Minting test tokens to MAIN ($(cast to-unit $DENOM ether) mUSD)"
  cast send "$TOKEN" "mint(address,uint256)" "$MAIN_ADDRESS" "$DENOM" \
    --rpc-url "$SOURCE_RPC_URL" --private-key "$DEPOSITOR_PRIVATE_KEY" >/dev/null
fi

echo "==> [1/4] Depositing on Sepolia (MAIN)"
DEP_OUT=$(cd client && SOURCE_RPC_URL=$SOURCE_RPC_URL DEPOSITOR_PRIVATE_KEY=$DEPOSITOR_PRIVATE_KEY \
  VAULT_ADDRESS=$VAULT_ADDRESS npx tsx src/deposit.ts)
echo "$DEP_OUT"
NOTE=$(echo "$DEP_OUT" | grep -m1 '^qie-note-v1:')
[ -n "$NOTE" ] || { echo "FATAL: could not capture note"; exit 1; }

VAULT_ROOT=$(cast call "$VAULT_ADDRESS" "latestRoot()(bytes32)" --rpc-url "$SOURCE_RPC_URL")
echo "    vault latestRoot=$VAULT_ROOT"

echo "==> [2/4] Running relayer once (proves inclusion + submits to QIE)"
# Anchor to latest so we do not wait ~15 min for Sepolia finality in the test.
(cd relayer && SOURCE_RPC_URL=$SOURCE_RPC_URL QIE_RPC_URL=$QIE_RPC_URL VAULT_ADDRESS=$VAULT_ADDRESS \
  UPDATER_ADDRESS=$UPDATER_ADDRESS RELAYER_PRIVATE_KEY=$RELAYER_PRIVATE_KEY ROOT_SLOT="${ROOT_SLOT:-3}" \
  ANCHOR_TAG=latest CONFIRMATIONS=0 POLL_INTERVAL_SECS=0 STORE_PATH=$(mktemp) cargo run --quiet)

ACCEPTED=$(cast call "$UPDATER_ADDRESS" "isAcceptedRoot(bytes32)(bool)" "$VAULT_ROOT" --rpc-url "$QIE_RPC_URL")
echo "    updater.isAcceptedRoot(vaultRoot) = $ACCEPTED"
[ "$ACCEPTED" = "true" ] || { echo "FAIL: root not bridged to QIE"; exit 1; }

echo "==> [3/4] Claiming on QIE from CLAIMER (real Groth16 proof)"
(cd client && SOURCE_RPC_URL=$SOURCE_RPC_URL QIE_RPC_URL=$QIE_RPC_URL CLAIMER_PRIVATE_KEY=$CLAIMER_PRIVATE_KEY \
  VAULT_ADDRESS=$VAULT_ADDRESS POOL_ADDRESS=$POOL_ADDRESS START_BLOCK=$START_BLOCK NOTE="$NOTE" \
  npx tsx src/claim.ts)

echo "==> [4/4] Verifying wrapped-token balance on QIE"
BAL=$(cast call "$WRAPPED_ADDRESS" "balanceOf(address)(uint256)" "$CLAIMER_ADDRESS" --rpc-url "$QIE_RPC_URL")
echo "    CLAIMER wrapped balance = $BAL"
echo "$BAL" | grep -q "^${DENOMINATION:-1000000000000000000}" \
  && echo "SUCCESS: live testnet shielded bridge worked end-to-end!" \
  || { echo "FAIL: unexpected balance"; exit 1; }
