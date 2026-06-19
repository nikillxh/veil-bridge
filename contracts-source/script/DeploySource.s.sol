// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ShieldedVault} from "../src/ShieldedVault.sol";
import {IHasher} from "../src/IHasher.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// Deploys the source-chain side: a test ERC20 (optional) and the ShieldedVault
/// wired to a pre-deployed Poseidon hasher.
///
/// Required env:
///   HASHER_ADDRESS  - Poseidon(2) hasher (deploy via client/src/deployPoseidon.ts)
/// Optional env:
///   DENOMINATION (default 1e18), LEVELS (default 20),
///   TOKEN_ADDRESS (default: deploy a MockERC20; address(0) => native coin)
contract DeploySource is Script {
    function run() external {
        address hasher = vm.envAddress("HASHER_ADDRESS");
        uint256 denomination = vm.envOr("DENOMINATION", uint256(1 ether));
        uint32 levels = uint32(vm.envOr("LEVELS", uint256(20)));
        address token = vm.envOr("TOKEN_ADDRESS", address(type(uint160).max));

        vm.startBroadcast();

        if (token == address(type(uint160).max)) {
            // Local stand-in for USDC: 6 decimals to match the real token.
            MockERC20 mock = new MockERC20("USD Coin", "USDC", 6);
            token = address(mock);
            console2.log("MockERC20:", token);
        }

        ShieldedVault vault = new ShieldedVault(levels, IHasher(hasher), token, denomination);

        vm.stopBroadcast();

        console2.log("ShieldedVault:", address(vault));
        console2.log("token:", token);
        console2.log("denomination:", denomination);
        console2.log("levels:", levels);
    }
}
