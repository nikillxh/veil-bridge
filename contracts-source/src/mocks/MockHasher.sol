// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHasher} from "../IHasher.sol";

/// @notice Test-only IHasher. Uses keccak256 reduced into the BN254 field
///         instead of Poseidon. This lets Foundry exercise the Merkle-tree /
///         vault / pool logic without deploying the circomlibjs Poseidon
///         bytecode. Production deployments MUST use the real Poseidon hasher
///         so that on-chain hashing matches the Circom circuit.
contract MockHasher is IHasher {
    uint256 internal constant FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    function poseidon(bytes32[2] calldata input) external pure returns (bytes32) {
        return bytes32(uint256(keccak256(abi.encodePacked(input[0], input[1]))) % FIELD_SIZE);
    }
}
