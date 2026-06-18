// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ShieldedVault} from "../src/ShieldedVault.sol";
import {MerkleTreeWithHistory} from "../src/MerkleTreeWithHistory.sol";
import {MockHasher} from "../src/mocks/MockHasher.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract ShieldedVaultTest is Test {
    MockHasher internal hasher;
    MockERC20 internal token;
    ShieldedVault internal vault;

    uint32 internal constant LEVELS = 20;
    uint256 internal constant DENOM = 1 ether;

    address internal alice = makeAddr("alice");

    event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);

    function setUp() public {
        hasher = new MockHasher();
        token = new MockERC20();
        vault = new ShieldedVault(LEVELS, hasher, address(token), DENOM);

        token.mint(alice, 10 ether);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
    }

    function _commitment(uint256 seed) internal pure returns (bytes32) {
        return bytes32(uint256(keccak256(abi.encode(seed))) % vaultField());
    }

    function vaultField() internal pure returns (uint256) {
        return 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    }

    function test_DepositLocksFundsAndEmits() public {
        bytes32 c = _commitment(1);
        bytes32 rootBefore = vault.getLastRoot();

        vm.expectEmit(true, false, false, false);
        emit Deposit(c, 0, block.timestamp);

        vm.prank(alice);
        vault.deposit(c);

        assertEq(token.balanceOf(address(vault)), DENOM, "vault locked funds");
        assertTrue(vault.commitments(c), "commitment recorded");
        assertEq(vault.nextIndex(), 1, "leaf index advanced");
        assertTrue(vault.getLastRoot() != rootBefore, "root changed");
        assertTrue(vault.isKnownRoot(vault.getLastRoot()), "new root known");
    }

    function test_MultipleDepositsAdvanceTree() public {
        vm.startPrank(alice);
        vault.deposit(_commitment(1));
        bytes32 r1 = vault.getLastRoot();
        vault.deposit(_commitment(2));
        bytes32 r2 = vault.getLastRoot();
        vm.stopPrank();

        assertEq(vault.nextIndex(), 2);
        assertTrue(r1 != r2);
        assertTrue(vault.isKnownRoot(r1), "old root still known");
        assertTrue(vault.isKnownRoot(r2));
    }

    function test_RevertOnDuplicateCommitment() public {
        bytes32 c = _commitment(1);
        vm.startPrank(alice);
        vault.deposit(c);
        vm.expectRevert(ShieldedVault.CommitmentAlreadyUsed.selector);
        vault.deposit(c);
        vm.stopPrank();
    }

    function test_RevertOnUnexpectedNativeValue() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(ShieldedVault.UnexpectedValue.selector);
        vault.deposit{value: 1 ether}(_commitment(9));
    }

    function test_NativeVault() public {
        ShieldedVault nativeVault = new ShieldedVault(LEVELS, hasher, address(0), DENOM);
        vm.deal(alice, 5 ether);

        vm.prank(alice);
        nativeVault.deposit{value: DENOM}(_commitment(7));
        assertEq(address(nativeVault).balance, DENOM);

        vm.prank(alice);
        vm.expectRevert(ShieldedVault.InvalidAmount.selector);
        nativeVault.deposit{value: 0.5 ether}(_commitment(8));
    }
}
