#!/usr/bin/env bash
#
# Push EVERYTHING to testnet + Vercel production:
#   1. deploy Poseidon + ShieldedVault on Sepolia
#   2. deploy BridgeUpdater + ShieldedPool + WrappedToken + verifier on QIE
#   3. write the deployed addresses back into ./.env (for relayer + e2e)
#   4. sync NEXT_PUBLIC_* env vars into the Vercel project
#   5. deploy the frontend to Vercel production
#
# Reads keys + RPCs from ./.env (created by the account-generation step). The
# MAIN account must be funded on Sepolia and QIE before running.
#
# Usage:  scripts/deploy_testnet.sh            # contracts + vercel
#         SKIP_CONTRACTS=1 scripts/deploy_testnet.sh   # only re-deploy frontend
#
# Requires: cast, forge, node/npm, vercel CLI (logged in).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
[ -f .env ] || { echo "FATAL: ./.env not found"; exit 1; }
set -a; . ./.env; set +a

VERCEL_PROJECT="${VERCEL_PROJECT:-veil-bridge}"
# Testnet uses a free-mint ERC20 test token (mUSD) so visitors can try the live
# site without holding a specific asset. LEVELS must stay 20 to match the
# compiled circuit + trusted setup; do not change it without recompiling.
DENOM="${DENOMINATION:-1000000000000000000}"   # 1 mUSD
LEVELS="${LEVELS:-20}"

set_env_var() { # key value  -> upsert into ./.env
  local k="$1" v="$2"
  if grep -q "^$k=" .env; then
    sed -i "s|^$k=.*|$k=$v|" .env
  else
    echo "$k=$v" >> .env
  fi
}

if [ "${SKIP_CONTRACTS:-0}" != "1" ]; then
  # If a hasher was already deployed once, reuse it. The Poseidon bytecode is
  # the single biggest cost (~2.17M gas); never redeploy it needlessly.
  HASHER="${HASHER_ADDRESS:-}"

  # --- gas precheck: estimate the Sepolia cost up front and bail BEFORE
  #     spending anything if the balance cannot cover it. ---
  GP_RAW=$(cast gas-price --rpc-url "$SOURCE_RPC_URL")
  # +25% inclusion buffer (still far below EIP-1559's ~2x maxFee reserve).
  GP=$(python3 -c "print(int(int($GP_RAW)*5//4))")
  BAL=$(cast balance "$MAIN_ADDRESS" --rpc-url "$SOURCE_RPC_URL")
  # ~2.2M poseidon (skipped if reused) + ~2.05M (test token + vault) + ~0.25M deposit.
  EST_GAS=2300000
  [ -z "$HASHER" ] && EST_GAS=$((EST_GAS + 2200000))
  NEED=$(python3 -c "print(int($GP)*$EST_GAS)")
  echo "==> Gas precheck (Sepolia): price=$(cast to-unit $GP gwei) gwei, est_gas=$EST_GAS"
  echo "    need ~$(cast to-unit $NEED ether) ETH, have $(cast to-unit $BAL ether) ETH"
  if [ "$(python3 -c "print(1 if $BAL < $NEED else 0)")" = "1" ]; then
    echo "ABORTING before spending: insufficient Sepolia ETH at current gas."
    echo "Top up MAIN ($MAIN_ADDRESS) or wait for lower gas, then rerun."
    exit 1
  fi

  if [ -z "$HASHER" ]; then
    echo "==> [1/5] Deploying Poseidon(2) hasher on Sepolia (legacy gas $(cast to-unit $GP gwei) gwei)"
    HASHER=$(cd client && SOURCE_RPC_URL=$SOURCE_RPC_URL DEPLOYER_PRIVATE_KEY=$DEPLOYER_PRIVATE_KEY \
      GAS_PRICE_WEI=$GP npx tsx src/deployPoseidon.ts | grep HASHER_ADDRESS | cut -d= -f2)
    echo "    hasher=$HASHER"
  else
    echo "==> [1/5] Reusing existing Poseidon hasher: $HASHER"
  fi

  SRC_DEPLOY_BLOCK=$(cast block-number --rpc-url "$SOURCE_RPC_URL")

  echo "==> [2/5] Deploying test token + ShieldedVault (denom $(cast to-unit $DENOM ether) mUSD) on Sepolia"
  SRC_OUT=$(cd contracts-source && HASHER_ADDRESS=$HASHER DENOMINATION=$DENOM LEVELS=$LEVELS \
    forge script script/DeploySource.s.sol --rpc-url "$SOURCE_RPC_URL" \
    --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast --slow --legacy --gas-price "$GP" 2>&1)
  VAULT=$(echo "$SRC_OUT" | grep "ShieldedVault:" | awk '{print $NF}')
  TOKEN=$(echo "$SRC_OUT" | grep "MockERC20:" | awk '{print $NF}')
  echo "    vault=$VAULT token=$TOKEN block=$SRC_DEPLOY_BLOCK"
  [ -n "$VAULT" ] || { echo "FATAL: vault deploy failed"; echo "$SRC_OUT" | tail -30; exit 1; }
  [ -n "$TOKEN" ] || { echo "FATAL: test token deploy failed"; echo "$SRC_OUT" | tail -30; exit 1; }

  echo "==> [3/5] Deploying QIE contracts (updater + pool + wrapped + verifier)"
  QIE_OUT=$(cd contracts-qie && SOURCE_VAULT=$VAULT DENOMINATION=$DENOM \
    forge script script/DeployQie.s.sol --rpc-url "$QIE_RPC_URL" \
    --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast --slow 2>&1)
  UPDATER=$(echo "$QIE_OUT" | grep "BridgeUpdater:" | awk '{print $NF}')
  POOL=$(echo "$QIE_OUT" | grep "ShieldedPool:" | awk '{print $NF}')
  WRAPPED=$(echo "$QIE_OUT" | grep "WrappedToken:" | awk '{print $NF}')
  echo "    updater=$UPDATER pool=$POOL wrapped=$WRAPPED"
  [ -n "$POOL" ] || { echo "FATAL: QIE deploy failed"; echo "$QIE_OUT" | tail -30; exit 1; }

  set_env_var HASHER_ADDRESS "$HASHER"
  set_env_var VAULT_ADDRESS "$VAULT"
  set_env_var TOKEN_ADDRESS "$TOKEN"
  set_env_var UPDATER_ADDRESS "$UPDATER"
  set_env_var POOL_ADDRESS "$POOL"
  set_env_var WRAPPED_ADDRESS "$WRAPPED"
  set_env_var VAULT_DEPLOY_BLOCK "$SRC_DEPLOY_BLOCK"
  echo "    addresses written to ./.env"
else
  echo "==> SKIP_CONTRACTS=1: reusing addresses from ./.env"
  VAULT=$VAULT_ADDRESS; TOKEN=$TOKEN_ADDRESS; UPDATER=$UPDATER_ADDRESS
  POOL=$POOL_ADDRESS; WRAPPED=$WRAPPED_ADDRESS
  SRC_DEPLOY_BLOCK="${VAULT_DEPLOY_BLOCK:-0}"
fi

echo "==> [4/5] Syncing NEXT_PUBLIC_* into Vercel project '$VERCEL_PROJECT'"
command -v vercel >/dev/null || { echo "FATAL: vercel CLI not found"; exit 1; }
vercel whoami >/dev/null 2>&1 || { echo "FATAL: vercel not logged in (run 'vercel login')"; exit 1; }

cd frontend
vercel link --yes --project "$VERCEL_PROJECT" >/dev/null 2>&1 || \
  vercel link --yes >/dev/null 2>&1 || true

push_vercel_env() { # NAME VALUE
  local name="$1" value="$2"
  vercel env rm "$name" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$name" production >/dev/null 2>&1
}

push_vercel_env NEXT_PUBLIC_SEPOLIA_RPC_URL "$SOURCE_RPC_URL"
push_vercel_env NEXT_PUBLIC_QIE_RPC_URL "$QIE_RPC_URL"
push_vercel_env NEXT_PUBLIC_VAULT_ADDRESS "$VAULT"
push_vercel_env NEXT_PUBLIC_TOKEN_ADDRESS "$TOKEN"
push_vercel_env NEXT_PUBLIC_UPDATER_ADDRESS "$UPDATER"
push_vercel_env NEXT_PUBLIC_POOL_ADDRESS "$POOL"
push_vercel_env NEXT_PUBLIC_WRAPPED_ADDRESS "$WRAPPED"
push_vercel_env NEXT_PUBLIC_MERKLE_LEVELS "$LEVELS"
push_vercel_env NEXT_PUBLIC_VAULT_DEPLOY_BLOCK "$SRC_DEPLOY_BLOCK"

# Local mirror so `npm run build` reproduces the production build.
cat > .env.production.local <<EOF
NEXT_PUBLIC_SEPOLIA_RPC_URL=$SOURCE_RPC_URL
NEXT_PUBLIC_QIE_RPC_URL=$QIE_RPC_URL
NEXT_PUBLIC_VAULT_ADDRESS=$VAULT
NEXT_PUBLIC_TOKEN_ADDRESS=$TOKEN
NEXT_PUBLIC_UPDATER_ADDRESS=$UPDATER
NEXT_PUBLIC_POOL_ADDRESS=$POOL
NEXT_PUBLIC_WRAPPED_ADDRESS=$WRAPPED
NEXT_PUBLIC_MERKLE_LEVELS=$LEVELS
NEXT_PUBLIC_VAULT_DEPLOY_BLOCK=$SRC_DEPLOY_BLOCK
EOF

echo "==> [5/5] Deploying frontend to Vercel production"
URL=$(vercel deploy --prod --yes)
echo ""
echo "============================  DEPLOYED  ============================"
echo "Vercel:   $URL"
echo "Vault:    $VAULT  (Sepolia)"
echo "Pool:     $POOL  (QIE)"
echo "Wrapped:  $WRAPPED  (QIE)"
echo "==================================================================="
