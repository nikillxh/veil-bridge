// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BridgeUpdater} from "./BridgeUpdater.sol";
import {WrappedToken} from "./WrappedToken.sol";
import {IWithdrawVerifier} from "./verifiers/IWithdrawVerifier.sol";

/// @title ShieldedPool
/// @notice The privacy claim endpoint on QIE. A claimer proves, with a Groth16
///         proof generated client-side from a fresh wallet, that they know the
///         secret behind a commitment that is a leaf of an accepted (bridged)
///         Merkle root. The pool checks the nullifier has not been spent and
///         mints the wrapped asset to the recipient. No information links the
///         recipient to the original source-chain depositor.
contract ShieldedPool is ReentrancyGuard {
    uint256 internal constant FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    IWithdrawVerifier public immutable verifier;
    BridgeUpdater public immutable updater;
    WrappedToken public immutable wrappedToken;
    /// @notice Amount minted per claim, matching the source vault denomination.
    uint256 public immutable denomination;

    /// @notice Spent nullifier hashes (double-spend protection).
    mapping(bytes32 => bool) public nullifierSpent;

    event Withdrawal(
        address indexed recipient, bytes32 indexed nullifierHash, address indexed relayer, uint256 fee
    );

    error RootNotAccepted(bytes32 root);
    error NullifierAlreadySpent(bytes32 nullifierHash);
    error FeeTooHigh(uint256 fee, uint256 denomination);
    error InvalidProof();
    error ValueOutOfField();

    constructor(
        IWithdrawVerifier _verifier,
        BridgeUpdater _updater,
        WrappedToken _wrappedToken,
        uint256 _denomination
    ) {
        verifier = _verifier;
        updater = _updater;
        wrappedToken = _wrappedToken;
        denomination = _denomination;
    }

    /// @notice Claim wrapped tokens against a shielded commitment.
    /// @param pA,pB,pC     Groth16 proof elements.
    /// @param root         A Merkle root that has been bridged + accepted.
    /// @param nullifierHash Poseidon(nullifier); revealed to prevent reuse.
    /// @param recipient    Where the wrapped tokens are minted.
    /// @param relayer      Optional gas relayer; receives `fee`.
    /// @param fee          Relayer fee (<= denomination), enabling gasless claims.
    /// @param refund       Reserved (native-coin refund); bound into the proof.
    function withdraw(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        bytes32 root,
        bytes32 nullifierHash,
        address recipient,
        address relayer,
        uint256 fee,
        uint256 refund
    ) external nonReentrant {
        if (nullifierSpent[nullifierHash]) revert NullifierAlreadySpent(nullifierHash);
        if (!updater.isAcceptedRoot(root)) revert RootNotAccepted(root);
        if (fee > denomination) revert FeeTooHigh(fee, denomination);
        if (uint256(root) >= FIELD_SIZE || uint256(nullifierHash) >= FIELD_SIZE) {
            revert ValueOutOfField();
        }

        uint256[6] memory pubSignals = [
            uint256(root),
            uint256(nullifierHash),
            uint256(uint160(recipient)),
            uint256(uint160(relayer)),
            fee,
            refund
        ];
        if (!verifier.verifyProof(pA, pB, pC, pubSignals)) revert InvalidProof();

        // Effects before interactions: burn the nullifier first.
        nullifierSpent[nullifierHash] = true;

        wrappedToken.mint(recipient, denomination - fee);
        if (fee > 0) {
            wrappedToken.mint(relayer, fee);
        }

        emit Withdrawal(recipient, nullifierHash, relayer, fee);
    }
}
