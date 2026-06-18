#!/usr/bin/env bash
# Export the Groth16 Solidity verifier for the withdraw circuit and copy it
# into the QIE contracts project.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=../contracts-qie/src/verifiers/WithdrawVerifier.sol
npx snarkjs zkey export solidityverifier build/withdraw_final.zkey "$OUT"

# snarkjs names the contract `Groth16Verifier`; align pragma + name with repo.
sed -i 's/contract Groth16Verifier/contract WithdrawVerifier/' "$OUT"

echo "Exported Solidity verifier -> $OUT"
