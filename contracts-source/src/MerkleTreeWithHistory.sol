// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHasher} from "./IHasher.sol";

/// @title MerkleTreeWithHistory
/// @notice Fixed-depth incremental Merkle tree over the BN254 scalar field
///         using Poseidon. Keeps a rolling window of recent roots so that a
///         proof generated against a slightly stale root is still accepted.
///         Adapted from tornado-core's MerkleTreeWithHistory.
contract MerkleTreeWithHistory {
    // BN254 scalar field. All leaves/roots are reduced modulo this prime so
    // they are valid Circom field elements.
    uint256 public constant FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // ZERO_VALUE = keccak256("qie-bridge") % FIELD_SIZE.
    uint256 public constant ZERO_VALUE =
        uint256(keccak256(abi.encodePacked("qie-bridge"))) % FIELD_SIZE;

    uint32 public constant ROOT_HISTORY_SIZE = 30;

    IHasher public immutable hasher;
    uint32 public immutable levels;

    // filledSubtrees[i] caches the left-most subtree hash at level i so a new
    // leaf can be inserted in O(levels). cachedZeros[i] is the hash of an
    // all-zero subtree of height i.
    mapping(uint256 => bytes32) public filledSubtrees;
    mapping(uint256 => bytes32) public cachedZeros;
    mapping(uint256 => bytes32) public roots;

    /// @notice Mirror of the most recent root in a fixed storage slot. The SP1
    ///         relayer proves THIS slot's value (a fixed slot is trivial to
    ///         address in an MPT storage proof, unlike a mapping entry).
    bytes32 public latestRoot;

    uint32 public currentRootIndex;
    uint32 public nextIndex;

    error LevelsOutOfRange();
    error MerkleTreeFull();
    error IndexOutOfBounds();

    constructor(uint32 _levels, IHasher _hasher) {
        if (_levels == 0 || _levels >= 32) revert LevelsOutOfRange();
        levels = _levels;
        hasher = _hasher;

        bytes32 current = bytes32(ZERO_VALUE);
        for (uint32 i = 0; i < _levels; i++) {
            cachedZeros[i] = current;
            filledSubtrees[i] = current;
            current = _hasher.poseidon([current, current]);
        }
        // `current` is now zeros(levels) = root of an empty tree.
        roots[0] = current;
        latestRoot = current;
    }

    /// @dev Poseidon(left, right) with field-range checks on the inputs.
    function hashLeftRight(bytes32 _left, bytes32 _right) public view returns (bytes32) {
        require(uint256(_left) < FIELD_SIZE, "left out of field");
        require(uint256(_right) < FIELD_SIZE, "right out of field");
        return hasher.poseidon([_left, _right]);
    }

    function _insert(bytes32 _leaf) internal returns (uint32 index) {
        uint32 _nextIndex = nextIndex;
        if (_nextIndex == uint32(2) ** levels) revert MerkleTreeFull();

        uint32 currentIndex = _nextIndex;
        bytes32 currentLevelHash = _leaf;
        bytes32 left;
        bytes32 right;

        for (uint32 i = 0; i < levels; i++) {
            if (currentIndex % 2 == 0) {
                left = currentLevelHash;
                right = cachedZeros[i];
                filledSubtrees[i] = currentLevelHash;
            } else {
                left = filledSubtrees[i];
                right = currentLevelHash;
            }
            currentLevelHash = hashLeftRight(left, right);
            currentIndex /= 2;
        }

        uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        currentRootIndex = newRootIndex;
        roots[newRootIndex] = currentLevelHash;
        latestRoot = currentLevelHash;
        nextIndex = _nextIndex + 1;
        return _nextIndex;
    }

    /// @notice Whether `_root` is one of the last ROOT_HISTORY_SIZE roots.
    function isKnownRoot(bytes32 _root) public view returns (bool) {
        if (_root == 0) return false;
        uint32 _currentRootIndex = currentRootIndex;
        uint32 i = _currentRootIndex;
        do {
            if (_root == roots[i]) return true;
            if (i == 0) {
                i = ROOT_HISTORY_SIZE;
            }
            i--;
        } while (i != _currentRootIndex);
        return false;
    }

    function getLastRoot() public view returns (bytes32) {
        return roots[currentRootIndex];
    }

    function zeros(uint256 i) external view returns (bytes32) {
        if (i >= levels) revert IndexOutOfBounds();
        return cachedZeros[i];
    }
}
