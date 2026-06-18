// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ISP1Verifier} from "@sp1-contracts/ISP1Verifier.sol";
import {SP1MockVerifier} from "@sp1-contracts/SP1MockVerifier.sol";
import {BridgeUpdater} from "../src/BridgeUpdater.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {WrappedToken} from "../src/WrappedToken.sol";
import {WithdrawVerifier} from "../src/verifiers/WithdrawVerifier.sol";
import {IWithdrawVerifier} from "../src/verifiers/IWithdrawVerifier.sol";

/// Deploys the QIE side: the Groth16 withdraw verifier, the wrapped token, the
/// SP1 light-client BridgeUpdater, and the ShieldedPool; then wires the pool as
/// the token minter.
///
/// Required env:
///   SOURCE_VAULT   - ShieldedVault address on the source chain
/// Optional env:
///   SP1_VERIFIER   - SP1 verifier gateway on QIE for on-chain proof verification
///                    (default: deploy SP1MockVerifier for native verification)
///   SP1_VKEY       - guest program vkey (default 0x0)
///   DENOMINATION   - must match the source vault (default 1e18)
contract DeployQie is Script {
    function run() external {
        address sourceVault = vm.envAddress("SOURCE_VAULT");
        bytes32 vkey = vm.envOr("SP1_VKEY", bytes32(0));
        uint256 denomination = vm.envOr("DENOMINATION", uint256(1 ether));
        address sp1 = vm.envOr("SP1_VERIFIER", address(0));

        vm.startBroadcast();
        address deployer = msg.sender;

        if (sp1 == address(0)) {
            sp1 = address(new SP1MockVerifier());
            console2.log("SP1MockVerifier (native verification):", sp1);
        }

        WithdrawVerifier verifier = new WithdrawVerifier();
        WrappedToken wrapped = new WrappedToken("Wrapped Bridged Asset", "wBRG", deployer);
        BridgeUpdater updater =
            new BridgeUpdater(ISP1Verifier(sp1), vkey, sourceVault, deployer);
        ShieldedPool pool = new ShieldedPool(
            IWithdrawVerifier(address(verifier)), updater, wrapped, denomination
        );
        wrapped.setMinter(address(pool));

        vm.stopBroadcast();

        console2.log("WithdrawVerifier:", address(verifier));
        console2.log("WrappedToken:", address(wrapped));
        console2.log("BridgeUpdater:", address(updater));
        console2.log("ShieldedPool:", address(pool));
    }
}
