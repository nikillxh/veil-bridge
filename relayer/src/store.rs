use std::collections::BTreeSet;
use std::path::PathBuf;

use eyre::Result;
use serde::{Deserialize, Serialize};

/// Tiny JSON-file persistence so the relayer doesn't re-prove/re-submit roots
/// across restarts. (A SQLite swap is trivial; JSON keeps the dependency set
/// minimal.)
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct State {
    /// Hex-encoded roots already submitted to QIE.
    pub submitted_roots: BTreeSet<String>,
    /// Highest source block we have proven a root for.
    pub last_proven_block: u64,
}

pub struct Store {
    path: PathBuf,
    state: State,
}

impl Store {
    pub fn load(path: impl Into<PathBuf>) -> Result<Self> {
        let path = path.into();
        let state = match std::fs::read(&path) {
            Ok(bytes) if !bytes.is_empty() => serde_json::from_slice(&bytes)?,
            _ => State::default(),
        };
        Ok(Self { path, state })
    }

    pub fn is_submitted(&self, root_hex: &str) -> bool {
        self.state.submitted_roots.contains(root_hex)
    }

    pub fn mark_submitted(&mut self, root_hex: &str, block: u64) -> Result<()> {
        self.state.submitted_roots.insert(root_hex.to_string());
        if block > self.state.last_proven_block {
            self.state.last_proven_block = block;
        }
        self.persist()
    }

    #[allow(dead_code)]
    pub fn last_proven_block(&self) -> u64 {
        self.state.last_proven_block
    }

    fn persist(&self) -> Result<()> {
        std::fs::write(&self.path, serde_json::to_vec_pretty(&self.state)?)?;
        Ok(())
    }
}
