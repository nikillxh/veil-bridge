use bridge_core::{verify_inclusion, InclusionInput};
use eyre::Result;

/// Output of a proving run: the ABI-encoded public values and the proof bytes
/// that get submitted to `BridgeUpdater.updateRoot`.
pub struct ProofBundle {
    pub public_values: Vec<u8>,
    pub proof_bytes: Vec<u8>,
}

pub trait Prover {
    fn prove(&self, input: &InclusionInput) -> Result<ProofBundle>;
}

/// Native verification prover: runs the exact same logic the guest runs
/// (`bridge_core::verify_inclusion`) in-process and emits an empty proof. It
/// pairs with `SP1MockVerifier` on QIE (which accepts a zero-length proof), so
/// the full deposit -> relay -> mint pipeline is exercisable end-to-end without
/// the Succinct toolchain. For on-chain-verified roots, use `Sp1Prover`.
pub struct NativeProver;

impl Prover for NativeProver {
    fn prove(&self, input: &InclusionInput) -> Result<ProofBundle> {
        let proven = verify_inclusion(input)
            .map_err(|e| eyre::eyre!("local inclusion verification failed: {:?}", e))?;
        Ok(ProofBundle {
            public_values: proven.abi_encode(),
            proof_bytes: Vec::new(),
        })
    }
}

/// Real SP1 prover. Generates a Groth16-wrapped proof of the guest program and
/// returns the verifier-ready public values + proof bytes.
#[cfg(feature = "sp1")]
pub struct Sp1Prover {
    elf: Vec<u8>,
}

#[cfg(feature = "sp1")]
impl Sp1Prover {
    pub fn from_elf_path(path: &str) -> Result<Self> {
        let elf = std::fs::read(path)
            .map_err(|e| eyre::eyre!("failed to read SP1 ELF at {path}: {e}"))?;
        Ok(Self { elf })
    }
}

#[cfg(feature = "sp1")]
impl Prover for Sp1Prover {
    fn prove(&self, input: &InclusionInput) -> Result<ProofBundle> {
        use sp1_sdk::{ProverClient, SP1Stdin};

        let mut stdin = SP1Stdin::new();
        stdin.write(input);

        let client = ProverClient::from_env();
        let (pk, _vk) = client.setup(&self.elf);
        let proof = client
            .prove(&pk, &stdin)
            .groth16()
            .run()
            .map_err(|e| eyre::eyre!("sp1 proving failed: {e}"))?;

        Ok(ProofBundle {
            public_values: proof.public_values.to_vec(),
            proof_bytes: proof.bytes(),
        })
    }
}
