//! Core verification logic shared between the SP1 guest program and the Rust
//! relayer (host). Keeping it in one crate guarantees the proof the relayer
//! generates and the public values the QIE contract decodes never drift.
//!
//! The proof attests, against a source-chain block header, that the
//! `ShieldedVault` contract's commitment Merkle-tree root had a specific value
//! in its storage at that block. This is the "ZK inclusion" trust model: we
//! verify state inclusion against a header (not full consensus).

#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

use alloc::vec::Vec;

use alloy_consensus::Header;
use alloy_primitives::{keccak256, Address, Bytes, B256, U256};
use alloy_rlp::Decodable;
use alloy_sol_types::SolValue;
use alloy_trie::{proof::verify_proof, Nibbles, TrieAccount};
use serde::{Deserialize, Serialize};

/// Everything the guest needs to verify a vault-root inclusion. The relayer
/// fills this in from `eth_getBlockByNumber` + `eth_getProof` and feeds it to
/// the zkVM via stdin.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InclusionInput {
    /// RLP-encoded source-chain block header.
    pub header_rlp: Bytes,
    /// Address of the ShieldedVault on the source chain.
    pub vault: Address,
    /// Storage slot holding the commitment-tree root we want to prove.
    pub root_slot: U256,
    /// RLP-encoded account leaf value (`TrieAccount`) for the vault.
    pub account_rlp: Bytes,
    /// Merkle-Patricia account proof (state trie) for the vault.
    pub account_proof: Vec<Bytes>,
    /// RLP-encoded storage value at `root_slot` (the root, as a U256 word).
    pub storage_value_rlp: Bytes,
    /// Merkle-Patricia storage proof (storage trie) for `root_slot`.
    pub storage_proof: Vec<Bytes>,
}

/// The verified, trust-minimized output committed as the proof's public values.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProvenRoot {
    pub block_hash: B256,
    pub block_number: u64,
    pub vault: Address,
    pub root: B256,
}

#[derive(Debug)]
pub enum VerifyError {
    HeaderDecode,
    AccountProof,
    AccountDecode,
    StorageProof,
    StorageDecode,
}

impl ProvenRoot {
    /// ABI-encode exactly as `abi.encode(bytes32, uint256, address, bytes32)`
    /// so it round-trips through `BridgePublicValues.decode` on QIE.
    pub fn abi_encode(&self) -> Vec<u8> {
        (
            self.block_hash,
            U256::from(self.block_number),
            self.vault,
            self.root,
        )
            .abi_encode_sequence()
    }
}

/// Verify the block header + account proof + storage proof and return the
/// (now trusted) proven root. Any inconsistency aborts the proof.
pub fn verify_inclusion(input: &InclusionInput) -> Result<ProvenRoot, VerifyError> {
    // 1. Decode the header. Its keccak hash is the canonical block hash.
    let header = Header::decode(&mut input.header_rlp.as_ref())
        .map_err(|_| VerifyError::HeaderDecode)?;
    let block_hash = header.hash_slow();

    // 2. Prove the vault account is in the state trie under header.state_root.
    let account_key = keccak256(input.vault.as_slice());
    verify_proof(
        header.state_root,
        Nibbles::unpack(account_key),
        Some(input.account_rlp.to_vec()),
        &input.account_proof,
    )
    .map_err(|_| VerifyError::AccountProof)?;

    let account = TrieAccount::decode(&mut input.account_rlp.as_ref())
        .map_err(|_| VerifyError::AccountDecode)?;

    // 3. Prove the root slot is in the vault's storage trie.
    let slot_key = keccak256(B256::from(input.root_slot).as_slice());
    verify_proof(
        account.storage_root,
        Nibbles::unpack(slot_key),
        Some(input.storage_value_rlp.to_vec()),
        &input.storage_proof,
    )
    .map_err(|_| VerifyError::StorageProof)?;

    // The storage value is an RLP-encoded U256 word; reinterpret as bytes32.
    let value = U256::decode(&mut input.storage_value_rlp.as_ref())
        .map_err(|_| VerifyError::StorageDecode)?;
    let root = B256::from(value);

    Ok(ProvenRoot {
        block_hash,
        block_number: header.number,
        vault: input.vault,
        root,
    })
}
