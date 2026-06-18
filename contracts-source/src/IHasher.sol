// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IHasher
/// @notice Poseidon hash over the BN254 scalar field, used for the incremental
///         Merkle tree. The deployed implementation is generated from
///         `circomlibjs` (`poseidonContract.createCode(2)`) so that on-chain
///         hashing is bit-for-bit identical to the Circom `Poseidon(2)`
///         gadget used inside the withdraw circuit. Unit tests inject a
///         lightweight keccak-based hasher that satisfies the same interface.
interface IHasher {
    /// @dev Poseidon hash of two field elements.
    function poseidon(bytes32[2] calldata input) external pure returns (bytes32);
}
