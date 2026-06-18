use alloy::primitives::{Address, U256};
use clap::Parser;

/// Relayer configuration, sourced from CLI flags or environment variables.
#[derive(Debug, Clone, Parser)]
#[command(name = "qie-bridge-relayer", about = "QIE ZK Privacy Bridge relayer")]
pub struct Config {
    /// Source-chain (EVM, e.g. Sepolia) JSON-RPC endpoint.
    #[arg(long, env = "SOURCE_RPC_URL")]
    pub source_rpc_url: String,

    /// QIE JSON-RPC endpoint (testnet chain id 1983).
    #[arg(long, env = "QIE_RPC_URL")]
    pub qie_rpc_url: String,

    /// ShieldedVault address on the source chain.
    #[arg(long, env = "VAULT_ADDRESS")]
    pub vault_address: Address,

    /// BridgeUpdater address on QIE.
    #[arg(long, env = "UPDATER_ADDRESS")]
    pub updater_address: Address,

    /// Storage slot of `latestRoot` in ShieldedVault (see `forge inspect`).
    #[arg(long, env = "ROOT_SLOT", default_value = "3")]
    pub root_slot: u64,

    /// Relayer private key (hex, with or without 0x) used to submit to QIE.
    #[arg(long, env = "RELAYER_PRIVATE_KEY")]
    pub relayer_private_key: String,

    /// SP1 program verification key (hex bytes32). Required for on-chain
    /// verification; unused by the native verification mode.
    #[arg(long, env = "SP1_VKEY", default_value = "")]
    pub sp1_vkey: String,

    /// Path to the compiled SP1 guest ELF (only used with `--features sp1`).
    #[arg(long, env = "SP1_ELF_PATH", default_value = "")]
    pub sp1_elf_path: String,

    /// Source block to anchor proofs to: "finalized" (default, reorg-safe) or
    /// "latest" (uses latest minus CONFIRMATIONS; faster, for demos/tests).
    #[arg(long, env = "ANCHOR_TAG", default_value = "finalized")]
    pub anchor_tag: String,

    /// Confirmations to subtract from `latest` when ANCHOR_TAG=latest.
    #[arg(long, env = "CONFIRMATIONS", default_value = "8")]
    pub confirmations: u64,

    /// Poll interval in seconds.
    #[arg(long, env = "POLL_INTERVAL_SECS", default_value = "15")]
    pub poll_interval_secs: u64,

    /// Path to the JSON state store.
    #[arg(long, env = "STORE_PATH", default_value = "relayer-state.json")]
    pub store_path: String,
}

impl Config {
    pub fn root_slot_u256(&self) -> U256 {
        U256::from(self.root_slot)
    }
}
