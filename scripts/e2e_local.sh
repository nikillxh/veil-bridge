#!/usr/bin/env bash
#
# Local end-to-end run of the QIE ZK Privacy Bridge on a single local node
# (acting as both the source chain and QIE). It exercises the FULL pipeline:
#
#   deposit (commitment) -> relayer proves vault root inclusion (bridge-core,
#   real header + MPT proofs) -> BridgeUpdater accepts root -> shielded claim
#   from a fresh wallet (real Groth16 proof) -> wrapped tokens minted.
#
# The bridge proof uses the native verification mode (in-process inclusion check
# + on-chain SP1MockVerifier) so the run does not require the Succinct toolchain,
# while still executing the real inclusion logic. The privacy proof is a REAL
# Groth16 proof.
#
# Requires: anvil, cast, forge, node/npm, circom build artifacts.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RPC=http://127.0.0.1:8545
# anvil default account #0
KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ACCT=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
# anvil default account #1 (fresh claimer)
KEY2=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
ACCT2=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
DENOM=10000   # 0.01 USDC (6 decimals)

cleanup() { [ -n "${ANVIL_PID:-}" ] && kill "$ANVIL_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "==> Starting anvil"
pkill -f "anvil --silent" 2>/dev/null || true
sleep 1
anvil --silent &
ANVIL_PID=$!
sleep 2

echo "==> Deploying Poseidon(2) hasher"
HASHER=$(cd "$ROOT_DIR/client" && SOURCE_RPC_URL=$RPC DEPLOYER_PRIVATE_KEY=$KEY npx tsx src/deployPoseidon.ts | grep HASHER_ADDRESS | cut -d= -f2)
echo "    hasher=$HASHER"

echo "==> Deploying ShieldedVault + local USDC mock (source)"
# Sentinel TOKEN_ADDRESS forces a fresh 6-decimal USDC mock and overrides any
# stale TOKEN_ADDRESS auto-loaded from ./.env by Foundry.
SRC_OUT=$(cd "$ROOT_DIR/contracts-source" && HASHER_ADDRESS=$HASHER DENOMINATION=$DENOM LEVELS=20 \
  TOKEN_ADDRESS=0xffffffffffffffffffffffffffffffffffffffff \
  forge script script/DeploySource.s.sol --rpc-url $RPC --private-key $KEY --broadcast 2>&1)
VAULT=$(echo "$SRC_OUT" | grep "ShieldedVault:" | awk '{print $NF}')
TOKEN=$(echo "$SRC_OUT" | grep -E "^\s*token:" | awk '{print $NF}')
echo "    vault=$VAULT token=$TOKEN"

echo "==> Deploying QIE side (updater, pool, wrapped token, verifier)"
QIE_OUT=$(cd "$ROOT_DIR/contracts-qie" && SOURCE_VAULT=$VAULT DENOMINATION=$DENOM \
  forge script script/DeployQie.s.sol --rpc-url $RPC --private-key $KEY --broadcast 2>&1)
UPDATER=$(echo "$QIE_OUT" | grep "BridgeUpdater:" | awk '{print $NF}')
POOL=$(echo "$QIE_OUT" | grep "ShieldedPool:" | awk '{print $NF}')
WRAPPED=$(echo "$QIE_OUT" | grep "WrappedToken:" | awk '{print $NF}')
echo "    updater=$UPDATER pool=$POOL wrapped=$WRAPPED"

echo "==> Generating note + making a shielded deposit (via cast)"
GEN=$(cd "$ROOT_DIR/client" && npx tsx src/genNote.ts)
NOTE=$(echo "$GEN" | grep "^NOTE=" | cut -d= -f2-)
COMMIT=$(echo "$GEN" | grep "^COMMITMENT=" | cut -d= -f2-)
echo "    note=$NOTE"
echo "    commitment=$COMMIT"
cast send "$TOKEN" "mint(address,uint256)" "$ACCT" 1000000 --rpc-url $RPC --private-key $KEY >/dev/null
cast send "$TOKEN" "approve(address,uint256)" "$VAULT" "$DENOM" --rpc-url $RPC --private-key $KEY >/dev/null
cast send "$VAULT" "deposit(bytes32)" "$COMMIT" --rpc-url $RPC --private-key $KEY >/dev/null

VAULT_ROOT=$(cast call "$VAULT" "latestRoot()(bytes32)" --rpc-url $RPC)
echo "    vault latestRoot=$VAULT_ROOT"

echo "==> Running relayer once (proves inclusion + submits to QIE updater)"
(cd "$ROOT_DIR/relayer" && SOURCE_RPC_URL=$RPC QIE_RPC_URL=$RPC VAULT_ADDRESS=$VAULT \
  UPDATER_ADDRESS=$UPDATER RELAYER_PRIVATE_KEY=$KEY ROOT_SLOT=3 POLL_INTERVAL_SECS=0 \
  STORE_PATH=$(mktemp) cargo run --quiet)

ACCEPTED=$(cast call "$UPDATER" "isAcceptedRoot(bytes32)(bool)" "$VAULT_ROOT" --rpc-url $RPC)
echo "    updater.isAcceptedRoot(vaultRoot) = $ACCEPTED"
[ "$ACCEPTED" = "true" ] || { echo "FAIL: root not accepted"; exit 1; }

echo "==> Claiming from a FRESH wallet (real Groth16 proof)"
(cd "$ROOT_DIR/client" && SOURCE_RPC_URL=$RPC QIE_RPC_URL=$RPC CLAIMER_PRIVATE_KEY=$KEY2 \
  VAULT_ADDRESS=$VAULT POOL_ADDRESS=$POOL NOTE="$NOTE" npx tsx src/claim.ts)

BAL=$(cast call "$WRAPPED" "balanceOf(address)(uint256)" "$ACCT2" --rpc-url $RPC | awk '{print $1}')
echo ""
echo "==> RESULT: fresh wallet wrapped-token balance = $BAL"
[ "$BAL" = "$DENOM" ] && echo "SUCCESS: end-to-end shielded bridge worked!" || { echo "FAIL: unexpected balance"; exit 1; }
