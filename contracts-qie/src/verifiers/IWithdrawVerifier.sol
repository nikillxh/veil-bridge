// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface matching the snarkjs-generated Groth16 verifier for the
///         withdraw circuit. Public signals (in order):
///         [root, nullifierHash, recipient, relayer, fee, refund].
interface IWithdrawVerifier {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[6] calldata pubSignals
    ) external view returns (bool);
}
