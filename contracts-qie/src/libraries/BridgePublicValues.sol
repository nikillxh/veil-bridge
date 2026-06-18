// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ABI schema shared between the SP1 guest program (Rust) and the
///         on-chain verifier. The SP1 program commits these fields as its
///         public values after verifying the source-chain header + MPT proof;
///         `BridgeUpdater` decodes them with the identical layout.
///
/// Keeping this in one place is the contract that prevents Rust/Solidity drift.
library BridgePublicValues {
    struct ProvenRoot {
        // keccak block hash of the proven source-chain block header.
        bytes32 blockHash;
        // Source-chain block number the proof was anchored to.
        uint256 blockNumber;
        // Address of the ShieldedVault on the source chain.
        address vault;
        // The vault's commitment Merkle-tree root at that block.
        bytes32 root;
    }

    function decode(bytes calldata publicValues) internal pure returns (ProvenRoot memory) {
        (bytes32 blockHash, uint256 blockNumber, address vault, bytes32 root) =
            abi.decode(publicValues, (bytes32, uint256, address, bytes32));
        return ProvenRoot(blockHash, blockNumber, vault, root);
    }

    function encode(ProvenRoot memory v) internal pure returns (bytes memory) {
        return abi.encode(v.blockHash, v.blockNumber, v.vault, v.root);
    }
}
