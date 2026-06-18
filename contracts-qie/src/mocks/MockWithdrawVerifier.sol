// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IWithdrawVerifier} from "../verifiers/IWithdrawVerifier.sol";

/// @notice Test-only Groth16 verifier. Returns a configurable result so the
///         ShieldedPool claim flow can be exercised without the real circuit.
contract MockWithdrawVerifier is IWithdrawVerifier {
    bool public result = true;

    function setResult(bool _result) external {
        result = _result;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[6] calldata
    ) external view returns (bool) {
        return result;
    }
}
