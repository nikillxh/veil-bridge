use alloy::sol;

// Minimal ABI bindings for the contracts the relayer interacts with.
sol! {
    #[sol(rpc)]
    contract ShieldedVault {
        bytes32 public latestRoot;
        event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);
    }
}

sol! {
    #[sol(rpc)]
    contract BridgeUpdater {
        function updateRoot(bytes calldata publicValues, bytes calldata proofBytes) external;
        function isAcceptedRoot(bytes32 root) external view returns (bool);
        function latestProvenBlock() external view returns (uint256);
    }
}
