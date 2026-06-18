//! SP1 guest program: the trustless core of the bridge.
//!
//! Reads an `InclusionInput` from the zkVM stdin, verifies the source-chain
//! block header + Merkle-Patricia account/storage proofs, and commits the
//! proven `(blockHash, blockNumber, vault, root)` as ABI-encoded public values.
//! The QIE `BridgeUpdater` accepts the root only if this proof verifies.

#![no_main]
sp1_zkvm::entrypoint!(main);

use bridge_core::{verify_inclusion, InclusionInput};

pub fn main() {
    let input = sp1_zkvm::io::read::<InclusionInput>();

    let proven = verify_inclusion(&input).expect("source-chain inclusion proof is invalid");

    // Commit the ABI-encoded public values (matches BridgePublicValues.decode).
    sp1_zkvm::io::commit_slice(&proven.abi_encode());
}
