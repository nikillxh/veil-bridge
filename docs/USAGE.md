# Usage walkthrough

## A. Local end-to-end (recommended first)

A single local node plays both the source chain and QIE, exercising the full
pipeline including the relayer's real header/MPT inclusion verification.

```bash
cd circuits && npm install && npm run build && cd ..   # one-time circuit build
cd client   && npm install && cd ..
bash scripts/e2e_local.sh
```

Expected tail:

```
==> RESULT: fresh wallet wrapped-token balance = 1000000000000000000
SUCCESS: end-to-end shielded bridge worked!
```

What it does:
1. Deploys the Poseidon hasher and `ShieldedVault` (with a test token) on the
   source chain.
2. Deploys `BridgeUpdater`, `ShieldedPool`, `WrappedToken`, and the Groth16
   `WithdrawVerifier` on QIE.
3. Makes a shielded deposit (commitment).
4. Runs the relayer once: builds the inclusion witness from `eth_getProof`,
   verifies header + MPT, and submits the proven root to QIE.
5. From a **fresh wallet**, generates a real Groth16 proof and claims, minting
   wrapped tokens.

## B. Full stack locally with the UI

Boot two local chains (ids matching the frontend), deploy everything, run the
relayer in a loop, and start the web app:

```bash
bash scripts/run_local.sh
```

Open `http://localhost:3000`, connect a wallet, deposit, then claim. The script
prints the local network details and a key to import.

## C. Live Sepolia -> QIE testnet + Vercel

Populate `./.env` (RPCs + keys), then:

```bash
bash scripts/deploy_testnet.sh          # deploy contracts, sync env, ship to Vercel
bash scripts/test_testnet_e2e.sh        # live deposit -> relayer -> claim assertion
```

The deploy script uses a native-coin vault with a small denomination, legacy gas
pricing, reuses an existing Poseidon hasher, and runs an upfront balance
precheck so it never half-spends. `SKIP_CONTRACTS=1` redeploys only the
frontend.

## D. Enabling succinct (fully trustless) SP1 proofs

```bash
# Install the Succinct toolchain
curl -L https://sp1up.succinct.xyz | bash && sp1up

# Build the guest ELF
cd sp1-program/program && cargo prove build

# Point the relayer at it and run with the sp1 feature
export SP1_ELF_PATH=../target/elf-compilation/.../bridge-program
export SP1_VKEY=0x...   # from ProverClient::setup
cd ../../relayer && cargo run --features sp1
```

Deploy the SP1 Groth16 verifier gateway on QIE and pass its address as
`SP1_VERIFIER` to `DeployQie`, with `SP1_VKEY` set to the guest vkey. QIE then
verifies every root on chain and the relayer is fully untrusted.
