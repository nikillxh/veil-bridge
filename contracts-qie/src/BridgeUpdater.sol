// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISP1Verifier} from "@sp1-contracts/ISP1Verifier.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BridgePublicValues} from "./libraries/BridgePublicValues.sol";

/// @title BridgeUpdater
/// @notice The QIE-side ZK light client. It does NOT trust the relayer. The
///         relayer submits an SP1 proof whose public values assert that a
///         particular ShieldedVault commitment-tree `root` existed at a given
///         source-chain block. This contract verifies that proof against the
///         SP1 verifier and, only on success, records the root as accepted.
///         `ShieldedPool` then allows shielded claims against accepted roots.
contract BridgeUpdater is Ownable {
    using BridgePublicValues for bytes;

    /// @notice The SP1 verifier (gateway) deployed on QIE.
    ISP1Verifier public immutable verifier;
    /// @notice The verification key of the inclusion-proof guest program.
    bytes32 public vkey;
    /// @notice The source ShieldedVault this light client tracks.
    address public immutable sourceVault;

    /// @notice root => block number it was proven at (0 == not accepted).
    mapping(bytes32 => uint256) public rootProvenAtBlock;
    /// @notice Highest source block number a root has been proven for.
    uint256 public latestProvenBlock;

    event RootUpdated(bytes32 indexed root, uint256 indexed blockNumber, bytes32 blockHash);
    event VkeyUpdated(bytes32 oldVkey, bytes32 newVkey);

    error UnexpectedVault(address got, address expected);
    error StaleProof(uint256 got, uint256 latest);

    constructor(ISP1Verifier _verifier, bytes32 _vkey, address _sourceVault, address _owner)
        Ownable(_owner)
    {
        verifier = _verifier;
        vkey = _vkey;
        sourceVault = _sourceVault;
    }

    /// @notice Verify an SP1 inclusion proof and accept the proven vault root.
    /// @param publicValues abi.encode(blockHash, blockNumber, vault, root).
    /// @param proofBytes   The SP1 (Groth16-wrapped) proof bytes.
    function updateRoot(bytes calldata publicValues, bytes calldata proofBytes) external {
        // 1. Mathematically verify the proof. Reverts on any tampering.
        verifier.verifyProof(vkey, publicValues, proofBytes);

        // 2. Decode the (now trusted) public values.
        BridgePublicValues.ProvenRoot memory pv = publicValues.decode();

        if (pv.vault != sourceVault) revert UnexpectedVault(pv.vault, sourceVault);

        // 3. Record the root. We accept roots monotonically by block height but
        //    keep older roots valid so in-flight withdrawals don't break.
        if (rootProvenAtBlock[pv.root] == 0) {
            rootProvenAtBlock[pv.root] = pv.blockNumber;
        }
        if (pv.blockNumber > latestProvenBlock) {
            latestProvenBlock = pv.blockNumber;
        }

        emit RootUpdated(pv.root, pv.blockNumber, pv.blockHash);
    }

    /// @notice True if `root` has been proven by a valid SP1 proof.
    function isAcceptedRoot(bytes32 root) external view returns (bool) {
        return rootProvenAtBlock[root] != 0;
    }

    /// @notice Rotate the guest-program verification key (e.g. after a circuit
    ///         upgrade). Owner-gated; in production this should be a timelock.
    function setVkey(bytes32 _vkey) external onlyOwner {
        emit VkeyUpdated(vkey, _vkey);
        vkey = _vkey;
    }
}
