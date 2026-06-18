#!/usr/bin/env bash
# Compile withdraw.circom into R1CS + WASM witness generator.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p build

# circomlib is resolved from node_modules (installed via `npm install`).
circom withdraw.circom \
  --r1cs --wasm --sym \
  -l node_modules \
  -o build

echo "Compiled -> build/withdraw.r1cs, build/withdraw_js/withdraw.wasm"
