// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleTreeWithHistory} from "./MerkleTreeWithHistory.sol";
import {IHasher} from "./IHasher.sol";

/// @title ShieldedVault
/// @notice Source-chain (EVM) side of the bridge. Users lock a fixed
///         denomination of an asset together with a Poseidon `commitment`
///         (a hash of a secret). The commitment is appended to an incremental
///         Merkle tree; the tree root is later proven into QIE by the SP1
///         light-client relayer. No destination address is ever recorded, so
///         the link between depositor and QIE recipient is severed.
contract ShieldedVault is MerkleTreeWithHistory, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The single asset this vault accepts. address(0) == native coin.
    address public immutable token;
    /// @notice Fixed deposit amount (mixers require uniform denominations to
    ///         provide a meaningful anonymity set).
    uint256 public immutable denomination;

    mapping(bytes32 => bool) public commitments;

    event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);

    error CommitmentAlreadyUsed();
    error InvalidAmount();
    error NativeNotAccepted();
    error UnexpectedValue();

    constructor(
        uint32 _levels,
        IHasher _hasher,
        address _token,
        uint256 _denomination
    ) MerkleTreeWithHistory(_levels, _hasher) {
        require(_denomination > 0, "denomination=0");
        token = _token;
        denomination = _denomination;
    }

    /// @notice Lock `denomination` of the asset and register `commitment`.
    /// @param commitment Poseidon(nullifier, secret), computed client-side.
    function deposit(bytes32 commitment) external payable nonReentrant {
        if (commitments[commitment]) revert CommitmentAlreadyUsed();
        require(uint256(commitment) < FIELD_SIZE, "commitment out of field");

        if (token == address(0)) {
            if (msg.value != denomination) revert InvalidAmount();
        } else {
            if (msg.value != 0) revert UnexpectedValue();
            IERC20(token).safeTransferFrom(msg.sender, address(this), denomination);
        }

        uint32 leafIndex = _insert(commitment);
        commitments[commitment] = true;

        emit Deposit(commitment, leafIndex, block.timestamp);
    }
}
