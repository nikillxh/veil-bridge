use alloy::eips::{BlockId, BlockNumberOrTag};
use alloy::primitives::{Address, B256, U256};
use alloy::providers::Provider;
use alloy::rpc::types::BlockTransactionsKind;
use alloy::transports::Transport;
use alloy_trie::TrieAccount;
use bridge_core::InclusionInput;
use eyre::{eyre, Result};

/// The data needed to relay one root: the zkVM input plus the proven root and
/// the source block it was anchored to.
pub struct RootJob {
    pub input: InclusionInput,
    pub root: B256,
    pub block_number: u64,
}

/// Resolve the source block we should anchor a proof to.
///
/// Default (`use_latest = false`): the chain's `finalized` tag, so reorgs can
/// never invalidate an already-minted claim. On dev chains that report genesis
/// as finalized (e.g. anvil) it falls back to `latest`.
///
/// `use_latest = true`: `latest - confirmations`. Faster than waiting for
/// finality (~15 min on Sepolia), at the cost of reorg safety; intended for
/// demos and integration tests.
pub async fn anchor_block_number<T: Transport + Clone, P: Provider<T>>(
    provider: &P,
    use_latest: bool,
    confirmations: u64,
) -> Result<u64> {
    if use_latest {
        let latest = provider
            .get_block_by_number(BlockNumberOrTag::Latest, BlockTransactionsKind::Hashes)
            .await?
            .ok_or_else(|| eyre!("no latest block available"))?;
        return Ok(latest.header.number.saturating_sub(confirmations));
    }

    // Prefer the `finalized` tag for real reorg safety.
    if let Some(block) = provider
        .get_block_by_number(BlockNumberOrTag::Finalized, BlockTransactionsKind::Hashes)
        .await?
    {
        if block.header.number > 0 {
            return Ok(block.header.number);
        }
    }
    // Fallback for dev chains (e.g. anvil) that report genesis as finalized.
    let latest = provider
        .get_block_by_number(BlockNumberOrTag::Latest, BlockTransactionsKind::Hashes)
        .await?
        .ok_or_else(|| eyre!("no latest block available"))?;
    Ok(latest.header.number)
}

/// Build the `InclusionInput` for the vault's `latestRoot` slot at `block`.
/// This is exactly the witness the SP1 guest verifies.
pub async fn build_root_job<T: Transport + Clone, P: Provider<T>>(
    provider: &P,
    vault: Address,
    root_slot: U256,
    block_number: u64,
) -> Result<RootJob> {
    // Header RLP -> the guest recomputes the block hash from this.
    let block = provider
        .get_block_by_number(
            BlockNumberOrTag::Number(block_number),
            BlockTransactionsKind::Hashes,
        )
        .await?
        .ok_or_else(|| eyre!("block {block_number} not found"))?;
    let header = block.header.inner.clone();
    let header_rlp = alloy::rlp::encode(&header);

    // eth_getProof for the root storage slot, anchored at the same block.
    let slot_b256 = B256::from(root_slot);
    let proof = provider
        .get_proof(vault, vec![slot_b256])
        .block_id(BlockId::Number(BlockNumberOrTag::Number(block_number)))
        .await?;

    let trie_account = TrieAccount {
        nonce: proof.nonce,
        balance: proof.balance,
        storage_root: proof.storage_hash,
        code_hash: proof.code_hash,
    };
    let account_rlp = alloy::rlp::encode(&trie_account);

    let storage = proof
        .storage_proof
        .first()
        .ok_or_else(|| eyre!("missing storage proof for root slot"))?;
    let storage_value_rlp = alloy::rlp::encode(storage.value);
    let root = B256::from(storage.value.to_be_bytes::<32>());

    let input = InclusionInput {
        header_rlp: header_rlp.into(),
        vault,
        root_slot,
        account_rlp: account_rlp.into(),
        account_proof: proof.account_proof,
        storage_value_rlp: storage_value_rlp.into(),
        storage_proof: storage.proof.clone(),
    };

    Ok(RootJob {
        input,
        root,
        block_number,
    })
}
