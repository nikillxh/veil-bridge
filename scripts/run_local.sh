#!/usr/bin/env bash
#
# Run the ENTIRE stack locally so you can use the dapp in a browser with a real
# wallet (MetaMask, Rabby, ...). It boots two anvil chains whose ids match the
# frontend config, deploys every contract, runs the relayer in a loop, and
# starts the Next.js dev server.
#
#   source side -> anvil :8545  (chain id 11155111, "Sepolia" locally)
#   QIE side    -> anvil :8546  (chain id 1983,     "QIE Testnet" locally)
#
# After it prints "STACK READY", open http://localhost:3000, add the two
# localhost networks to your wallet, import the anvil key shown below, and run
# the deposit -> claim flow. The relayer bridges roots automatically.
#
# Requires: anvil, cast, forge, node/npm, and circuit artifacts in
# frontend/public/circuits (already committed).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_RPC=http://127.0.0.1:8545
QIE_RPC=http://127.0.0.1:8546
SRC_CHAIN_ID=11155111
QIE_CHAIN_ID=1983
DENOM=1000000000000000000
LEVELS=20

# anvil default account #0 (deployer + relayer). Import this into your wallet.
KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ACCT=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

PIDS=()
cleanup() {
  echo ""
  echo "==> Shutting down local stack"
  for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done
  pkill -f "anvil --port 8545" 2>/dev/null || true
  pkill -f "anvil --port 8546" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Starting two anvil chains"
pkill -f "anvil --port 8545" 2>/dev/null || true
pkill -f "anvil --port 8546" 2>/dev/null || true
sleep 1
anvil --port 8545 --chain-id $SRC_CHAIN_ID --silent & PIDS+=($!)
anvil --port 8546 --chain-id $QIE_CHAIN_ID --silent & PIDS+=($!)
sleep 2

echo "==> Deploying Poseidon(2) hasher (source)"
HASHER=$(cd "$ROOT_DIR/client" && SOURCE_RPC_URL=$SRC_RPC DEPLOYER_PRIVATE_KEY=$KEY \
  npx tsx src/deployPoseidon.ts | grep HASHER_ADDRESS | cut -d= -f2)
echo "    hasher=$HASHER"

SRC_DEPLOY_BLOCK=$(cast block-number --rpc-url $SRC_RPC)

echo "==> Deploying source contracts (vault + test token)"
SRC_OUT=$(cd "$ROOT_DIR/contracts-source" && HASHER_ADDRESS=$HASHER DENOMINATION=$DENOM LEVELS=$LEVELS \
  forge script script/DeploySource.s.sol --rpc-url $SRC_RPC --private-key $KEY --broadcast 2>&1)
VAULT=$(echo "$SRC_OUT" | grep "ShieldedVault:" | awk '{print $NF}')
TOKEN=$(echo "$SRC_OUT" | grep "MockERC20:" | awk '{print $NF}')
echo "    vault=$VAULT token=$TOKEN"

echo "==> Deploying QIE contracts (updater + pool + wrapped + verifier)"
QIE_OUT=$(cd "$ROOT_DIR/contracts-qie" && SOURCE_VAULT=$VAULT DENOMINATION=$DENOM \
  forge script script/DeployQie.s.sol --rpc-url $QIE_RPC --private-key $KEY --broadcast 2>&1)
UPDATER=$(echo "$QIE_OUT" | grep "BridgeUpdater:" | awk '{print $NF}')
POOL=$(echo "$QIE_OUT" | grep "ShieldedPool:" | awk '{print $NF}')
WRAPPED=$(echo "$QIE_OUT" | grep "WrappedToken:" | awk '{print $NF}')
echo "    updater=$UPDATER pool=$POOL wrapped=$WRAPPED"

echo "==> Writing frontend/.env.local"
cat > "$ROOT_DIR/frontend/.env.local" <<EOF
NEXT_PUBLIC_SEPOLIA_RPC_URL=$SRC_RPC
NEXT_PUBLIC_QIE_RPC_URL=$QIE_RPC
NEXT_PUBLIC_VAULT_ADDRESS=$VAULT
NEXT_PUBLIC_TOKEN_ADDRESS=$TOKEN
NEXT_PUBLIC_UPDATER_ADDRESS=$UPDATER
NEXT_PUBLIC_POOL_ADDRESS=$POOL
NEXT_PUBLIC_WRAPPED_ADDRESS=$WRAPPED
NEXT_PUBLIC_MERKLE_LEVELS=$LEVELS
NEXT_PUBLIC_VAULT_DEPLOY_BLOCK=$SRC_DEPLOY_BLOCK
EOF

echo "==> Starting relayer loop (bridges vault roots 8545 -> 8546)"
(cd "$ROOT_DIR/relayer" && SOURCE_RPC_URL=$SRC_RPC QIE_RPC_URL=$QIE_RPC VAULT_ADDRESS=$VAULT \
  UPDATER_ADDRESS=$UPDATER RELAYER_PRIVATE_KEY=$KEY ROOT_SLOT=3 POLL_INTERVAL_SECS=10 \
  STORE_PATH=$(mktemp) cargo run --quiet) & PIDS+=($!)

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
  echo "==> Installing frontend deps (first run)"
  (cd "$ROOT_DIR/frontend" && npm install)
fi

cat <<EOF

============================  STACK READY  ============================
Frontend:    http://localhost:3000   (starting now)

Add these networks to your wallet, then import the anvil key below:

  Network 1 (source / "Sepolia")
    RPC URL:   $SRC_RPC
    Chain ID:  $SRC_CHAIN_ID
    Currency:  ETH

  Network 2 ("QIE Testnet")
    RPC URL:   $QIE_RPC
    Chain ID:  $QIE_CHAIN_ID
    Currency:  QIE

  Test account (has ETH + QIE on both chains):
    Address:     $ACCT
    Private key: $KEY

Flow: Deposit page mints test tokens + locks them, you save the note,
then the Claim page proves membership and mints wrapped tokens on QIE.
The relayer bridges the root in the background within ~10s.

Press Ctrl-C to tear the whole stack down.
=======================================================================

EOF

cd "$ROOT_DIR/frontend" && npm run dev
