#!/usr/bin/env bash
# Groth16 trusted setup for the withdraw circuit.
# This runs a local Phase 2 contribution on top of an existing perpetual
# powers-of-tau. Run a multi-party ceremony for the production parameters.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p build
cd build

PTAU=powersOfTau28_hez_final_15.ptau
SNARKJS="npx snarkjs"

if [ ! -f "$PTAU" ]; then
  echo "Downloading powers-of-tau (2^15 constraints)..."
  curl -sL -o "$PTAU" \
    "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_15.ptau"
fi

echo "Phase 2 setup..."
$SNARKJS groth16 setup withdraw.r1cs "$PTAU" withdraw_0000.zkey

echo "Contributing randomness..."
$SNARKJS zkey contribute withdraw_0000.zkey withdraw_final.zkey \
  --name="veil-bridge-phase2" -v -e="$(head -c 64 /dev/urandom | xxd -p | tr -d '\n')"

$SNARKJS zkey export verificationkey withdraw_final.zkey verification_key.json

echo "Setup complete -> build/withdraw_final.zkey, build/verification_key.json"
