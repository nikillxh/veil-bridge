mod config;
mod contracts;
mod prover;
mod store;
mod watcher;

use std::time::Duration;

use alloy::network::EthereumWallet;
use alloy::providers::ProviderBuilder;
use alloy::signers::local::PrivateKeySigner;
use clap::Parser;
use eyre::{eyre, Result};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

use crate::config::Config;
use crate::contracts::BridgeUpdater;
use crate::prover::{NativeProver, Prover};
use crate::store::Store;

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let cfg = Config::parse();
    run(cfg).await
}

async fn run(cfg: Config) -> Result<()> {
    // Read-only provider for the source chain (Sepolia).
    let source_provider = ProviderBuilder::new().on_http(cfg.source_rpc_url.parse()?);

    // Wallet-backed provider for QIE so we can submit updateRoot transactions.
    let signer: PrivateKeySigner = cfg
        .relayer_private_key
        .trim_start_matches("0x")
        .parse()
        .map_err(|e| eyre!("invalid relayer private key: {e}"))?;
    let wallet = EthereumWallet::from(signer);
    let qie_provider = ProviderBuilder::new()
        .with_recommended_fillers()
        .wallet(wallet)
        .on_http(cfg.qie_rpc_url.parse()?);

    // Select the prover. Real SP1 proving requires `--features sp1` + an ELF.
    let prover = select_prover(&cfg)?;

    let mut store = Store::load(&cfg.store_path)?;

    info!(
        vault = %cfg.vault_address,
        updater = %cfg.updater_address,
        "relayer started"
    );

    loop {
        if let Err(e) =
            relay_once(&cfg, &source_provider, &qie_provider, prover.as_ref(), &mut store).await
        {
            warn!("relay iteration failed: {e:?}");
        }
        if cfg.poll_interval_secs == 0 {
            break;
        }
        tokio::time::sleep(Duration::from_secs(cfg.poll_interval_secs)).await;
    }
    Ok(())
}

async fn relay_once<T1, T2, P, Q>(
    cfg: &Config,
    source_provider: &P,
    qie_provider: &Q,
    prover: &dyn Prover,
    store: &mut Store,
) -> Result<()>
where
    T1: alloy::transports::Transport + Clone,
    T2: alloy::transports::Transport + Clone,
    P: alloy::providers::Provider<T1>,
    Q: alloy::providers::Provider<T2>,
{
    let use_latest = cfg.anchor_tag.eq_ignore_ascii_case("latest");
    let block_number =
        watcher::anchor_block_number(source_provider, use_latest, cfg.confirmations).await?;
    let job =
        watcher::build_root_job(source_provider, cfg.vault_address, cfg.root_slot_u256(), block_number)
            .await?;

    let root_hex = format!("0x{}", hex::encode(job.root));
    if store.is_submitted(&root_hex) {
        return Ok(());
    }

    info!(root = %root_hex, block = job.block_number, "proving new vault root");
    let bundle = prover.prove(&job.input)?;

    let updater = BridgeUpdater::new(cfg.updater_address, qie_provider);
    let pending = updater
        .updateRoot(bundle.public_values.into(), bundle.proof_bytes.into())
        .send()
        .await?;
    let receipt = pending.get_receipt().await?;
    info!(
        root = %root_hex,
        tx = %receipt.transaction_hash,
        "root accepted on QIE"
    );

    store.mark_submitted(&root_hex, job.block_number)?;
    Ok(())
}

#[cfg(feature = "sp1")]
fn select_prover(cfg: &Config) -> Result<Box<dyn Prover>> {
    if cfg.sp1_elf_path.is_empty() {
        warn!("SP1 feature enabled but SP1_ELF_PATH empty; falling back to native verification");
        return Ok(Box::new(NativeProver));
    }
    Ok(Box::new(prover::Sp1Prover::from_elf_path(&cfg.sp1_elf_path)?))
}

#[cfg(not(feature = "sp1"))]
fn select_prover(_cfg: &Config) -> Result<Box<dyn Prover>> {
    info!("using native verification (build with --features sp1 for on-chain-verified proofs)");
    Ok(Box::new(NativeProver))
}
