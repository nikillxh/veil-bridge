// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SP1MockVerifier} from "@sp1-contracts/SP1MockVerifier.sol";
import {BridgeUpdater} from "../src/BridgeUpdater.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {WrappedToken} from "../src/WrappedToken.sol";
import {MockWithdrawVerifier} from "../src/mocks/MockWithdrawVerifier.sol";
import {BridgePublicValues} from "../src/libraries/BridgePublicValues.sol";

contract BridgeTest is Test {
    SP1MockVerifier internal sp1;
    BridgeUpdater internal updater;
    MockWithdrawVerifier internal withdrawVerifier;
    WrappedToken internal wrapped;
    ShieldedPool internal pool;

    uint256 internal constant DENOM = 1 ether;
    bytes32 internal constant VKEY = bytes32(uint256(0xABCD));
    address internal constant SOURCE_VAULT = address(0x1234567890AbcdEF1234567890aBcdef12345678);

    address internal owner = makeAddr("owner");
    address internal recipient = makeAddr("recipient");
    address internal relayer = makeAddr("relayer");

    function setUp() public {
        sp1 = new SP1MockVerifier();
        updater = new BridgeUpdater(sp1, VKEY, SOURCE_VAULT, owner);

        withdrawVerifier = new MockWithdrawVerifier();
        wrapped = new WrappedToken("Wrapped mUSD", "wmUSD", owner);
        pool = new ShieldedPool(withdrawVerifier, updater, wrapped, DENOM);

        vm.prank(owner);
        wrapped.setMinter(address(pool));
    }

    function _proven(bytes32 root, uint256 blockNumber)
        internal
        pure
        returns (bytes memory publicValues)
    {
        return BridgePublicValues.encode(
            BridgePublicValues.ProvenRoot({
                blockHash: keccak256(abi.encode(blockNumber)),
                blockNumber: blockNumber,
                vault: SOURCE_VAULT,
                root: root
            })
        );
    }

    function test_UpdateRootAcceptsProvenRoot() public {
        bytes32 root = bytes32(uint256(123));
        assertFalse(updater.isAcceptedRoot(root));

        updater.updateRoot(_proven(root, 100), "");

        assertTrue(updater.isAcceptedRoot(root));
        assertEq(updater.rootProvenAtBlock(root), 100);
        assertEq(updater.latestProvenBlock(), 100);
    }

    function test_UpdateRootRejectsWrongVault() public {
        bytes memory pv = BridgePublicValues.encode(
            BridgePublicValues.ProvenRoot({
                blockHash: bytes32(0),
                blockNumber: 1,
                vault: address(0xBAD),
                root: bytes32(uint256(1))
            })
        );
        vm.expectRevert();
        updater.updateRoot(pv, "");
    }

    function test_WithdrawMintsWrappedTokens() public {
        bytes32 root = bytes32(uint256(0x111));
        bytes32 nullifierHash = bytes32(uint256(0x222));
        updater.updateRoot(_proven(root, 10), "");

        _withdraw(root, nullifierHash, recipient, address(0), 0, 0);

        assertEq(wrapped.balanceOf(recipient), DENOM);
        assertTrue(pool.nullifierSpent(nullifierHash));
    }

    function test_WithdrawWithRelayerFee() public {
        bytes32 root = bytes32(uint256(0x111));
        bytes32 nullifierHash = bytes32(uint256(0x333));
        updater.updateRoot(_proven(root, 10), "");

        uint256 fee = 0.05 ether;
        _withdraw(root, nullifierHash, recipient, relayer, fee, 0);

        assertEq(wrapped.balanceOf(recipient), DENOM - fee);
        assertEq(wrapped.balanceOf(relayer), fee);
    }

    function test_RevertDoubleSpend() public {
        bytes32 root = bytes32(uint256(0x111));
        bytes32 nullifierHash = bytes32(uint256(0x444));
        updater.updateRoot(_proven(root, 10), "");

        _withdraw(root, nullifierHash, recipient, address(0), 0, 0);
        vm.expectRevert(
            abi.encodeWithSelector(ShieldedPool.NullifierAlreadySpent.selector, nullifierHash)
        );
        _withdraw(root, nullifierHash, recipient, address(0), 0, 0);
    }

    function test_RevertUnacceptedRoot() public {
        bytes32 root = bytes32(uint256(0x999));
        vm.expectRevert(abi.encodeWithSelector(ShieldedPool.RootNotAccepted.selector, root));
        _withdraw(root, bytes32(uint256(0x555)), recipient, address(0), 0, 0);
    }

    function test_RevertInvalidProof() public {
        bytes32 root = bytes32(uint256(0x111));
        updater.updateRoot(_proven(root, 10), "");
        withdrawVerifier.setResult(false);
        vm.expectRevert(ShieldedPool.InvalidProof.selector);
        _withdraw(root, bytes32(uint256(0x666)), recipient, address(0), 0, 0);
    }

    function _withdraw(
        bytes32 root,
        bytes32 nullifierHash,
        address to,
        address rel,
        uint256 fee,
        uint256 refund
    ) internal {
        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;
        pool.withdraw(pA, pB, pC, root, nullifierHash, to, rel, fee, refund);
    }
}
