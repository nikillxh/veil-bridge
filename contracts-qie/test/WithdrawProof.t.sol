// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SP1MockVerifier} from "@sp1-contracts/SP1MockVerifier.sol";
import {BridgeUpdater} from "../src/BridgeUpdater.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {WrappedToken} from "../src/WrappedToken.sol";
import {WithdrawVerifier} from "../src/verifiers/WithdrawVerifier.sol";
import {IWithdrawVerifier} from "../src/verifiers/IWithdrawVerifier.sol";
import {BridgePublicValues} from "../src/libraries/BridgePublicValues.sol";

/// End-to-end test of the REAL privacy stack: a Groth16 proof produced by the
/// Circom circuit + TS client (see client/src/genFixture.ts) is verified by the
/// snarkjs-exported on-chain verifier, and the ShieldedPool mints against a
/// bridged root. This closes the loop between the circuit and the contracts.
contract WithdrawProofTest is Test {
    SP1MockVerifier internal sp1;
    BridgeUpdater internal updater;
    WithdrawVerifier internal verifier;
    WrappedToken internal wrapped;
    ShieldedPool internal pool;

    uint256 internal constant DENOM = 1 ether;
    bytes32 internal constant VKEY = bytes32(uint256(0xABCD));
    address internal constant SOURCE_VAULT = address(0x1234567890AbcdEF1234567890aBcdef12345678);
    address internal owner = makeAddr("owner");

    // Parsed fixture.
    uint256[2] internal pA;
    uint256[2][2] internal pB;
    uint256[2] internal pC;
    bytes32 internal root;
    bytes32 internal nullifierHash;
    address internal recipient;
    address internal relayer;
    uint256 internal fee;
    uint256 internal refund;

    function setUp() public {
        _loadFixture();

        sp1 = new SP1MockVerifier();
        updater = new BridgeUpdater(sp1, VKEY, SOURCE_VAULT, owner);
        verifier = new WithdrawVerifier();
        wrapped = new WrappedToken("Wrapped USDC", "wUSDC", 6, owner);
        pool = new ShieldedPool(IWithdrawVerifier(address(verifier)), updater, wrapped, DENOM);

        vm.prank(owner);
        wrapped.setMinter(address(pool));

        // Bridge the fixture's root (native verification => empty proof bytes).
        bytes memory pv = BridgePublicValues.encode(
            BridgePublicValues.ProvenRoot({
                blockHash: keccak256("blk"),
                blockNumber: 1,
                vault: SOURCE_VAULT,
                root: root
            })
        );
        updater.updateRoot(pv, "");
    }

    function test_RealProofVerifiesOnChain() public view {
        uint256[6] memory pub = [
            uint256(root),
            uint256(nullifierHash),
            uint256(uint160(recipient)),
            uint256(uint160(relayer)),
            fee,
            refund
        ];
        assertTrue(verifier.verifyProof(pA, pB, pC, pub), "groth16 proof must verify");
    }

    function test_ShieldedClaimMintsWithRealProof() public {
        assertEq(wrapped.balanceOf(recipient), 0);

        pool.withdraw(pA, pB, pC, root, nullifierHash, recipient, relayer, fee, refund);

        assertEq(wrapped.balanceOf(recipient), DENOM, "recipient minted full denomination");
        assertTrue(pool.nullifierSpent(nullifierHash), "nullifier burned");
    }

    function test_RevertReplayWithRealProof() public {
        pool.withdraw(pA, pB, pC, root, nullifierHash, recipient, relayer, fee, refund);
        vm.expectRevert(
            abi.encodeWithSelector(ShieldedPool.NullifierAlreadySpent.selector, nullifierHash)
        );
        pool.withdraw(pA, pB, pC, root, nullifierHash, recipient, relayer, fee, refund);
    }

    function _loadFixture() internal {
        string memory json = vm.readFile("test/fixtures/withdraw_fixture.json");
        root = vm.parseJsonBytes32(json, ".root");
        nullifierHash = vm.parseJsonBytes32(json, ".nullifierHash");
        recipient = vm.parseJsonAddress(json, ".recipient");
        relayer = vm.parseJsonAddress(json, ".relayer");
        fee = vm.parseJsonUint(json, ".fee");
        refund = vm.parseJsonUint(json, ".refund");

        uint256[] memory a = vm.parseJsonUintArray(json, ".pA");
        uint256[] memory b0 = vm.parseJsonUintArray(json, ".pB[0]");
        uint256[] memory b1 = vm.parseJsonUintArray(json, ".pB[1]");
        uint256[] memory c = vm.parseJsonUintArray(json, ".pC");

        pA = [a[0], a[1]];
        pB = [[b0[0], b0[1]], [b1[0], b1[1]]];
        pC = [c[0], c[1]];
    }
}
