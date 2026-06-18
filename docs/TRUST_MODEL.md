# Trust model

## What this protocol proves (and what it assumes)

The QIE side verifies a **state-inclusion** proof. Concretely, the SP1 guest
(`bridge-core::verify_inclusion`) proves:

- A block header RLP hashes to `blockHash` and contains `stateRoot`.
- The `ShieldedVault` account is included in the state trie under `stateRoot`
  (Merkle-Patricia account proof).
- The vault's `latestRoot` storage slot has value `root` under the account's
  storage root (Merkle-Patricia storage proof).

Because the root is proven, the relayer is never trusted for state correctness:
it cannot forge or backdate a vault root, since a false claim would fail SP1
verification inside `BridgeUpdater`.

### Assumption

The verifier is given a **block header** and trusts that this header belongs to
the canonical source chain. Reorgs are mitigated by anchoring every proof to the
`finalized` block. Source-chain consensus (sync-committee BLS signatures) is not
re-verified inside the circuit at this layer; see the roadmap below for the path
to consensus verification.

## Verification modes

| Mode | Prover | On-chain verifier | Trust in relayer |
|------|--------|-------------------|------------------|
| Native | `NativeProver` (in-process inclusion check) | `SP1MockVerifier` | Relayer asserts the root |
| Succinct (`--features sp1`) | `Sp1Prover` | SP1 Groth16 gateway | None - the proof is verified on chain |

Both modes run the **same** `verify_inclusion` logic over the same witness, so
the native mode is a faithful integration-test path: it validates the witness
and contract flow end to end, then the Succinct mode wraps that identical
computation in a succinct proof that QIE verifies. Switch the relayer to
`--features sp1` and point `BridgeUpdater` at the deployed SP1 verifier gateway
with the guest program's vkey to remove all trust in the relayer.

## Privacy guarantees

- Deposits register only a Poseidon `commitment`; no destination is recorded.
- Claims happen from an unrelated wallet and reveal only `nullifierHash`, which
  is unlinkable to the depositor.
- The anonymity set is all deposits of the same fixed `denomination`. Larger
  sets give stronger privacy; non-uniform amounts would leak linkage, so the
  denomination is fixed per deployment.

## Roadmap

- **Consensus-verified headers.** Replace the trusted-header input with a
  verified one, either via an on-chain header accumulator on QIE updated by a
  consensus proof, or by extending the SP1 program to verify source-chain
  consensus and commit the verified header. `bridge-core` is structured so this
  becomes an additional verification step ahead of the existing inclusion checks.
- **Multi-party trusted setup.** Run a multi-contributor MPC ceremony for the
  Groth16 parameters to remove reliance on any single setup participant.
- **Multi-asset and multi-denomination support** with per-asset anonymity pools.
- **Bidirectional transfers.** Add the return path (burn on QIE, unlock on the
  source chain) using the same inclusion-proof machinery in reverse.
- **Relayer fee market.** Run the gasless-claim relayer as a service; the
  contracts already support a `relayer`/`fee` parameter on `withdraw`.
