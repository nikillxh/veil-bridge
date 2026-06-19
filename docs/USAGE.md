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
==> RESULT: fresh wallet wrapped-token balance = 10000
SUCCESS: end-to-end shielded bridge worked!
```

The balance `10000` is 0.01 wUSDC (6 decimals), the fixed per-note denomination.

What it does:
1. Deploys the Poseidon hasher and `ShieldedVault` on the source chain, wired to
   a local 6-decimal USDC stand-in.
2. Deploys `BridgeUpdater`, `ShieldedPool`, `WrappedToken` (wUSDC, 6 decimals),
   and the Groth16 `WithdrawVerifier` on QIE.
3. Makes a shielded deposit (commitment) of one 0.01 USDC note.
4. Runs the relayer once: builds the inclusion witness from `eth_getProof`,
   verifies header + MPT, and submits the proven root to QIE.
5. From a **fresh wallet**, generates a real Groth16 proof and claims, minting
   0.01 wUSDC.

## B. Full stack locally with the UI

Boot two local chains (ids matching the frontend), deploy everything, run the
relayer in a loop, and start the web app:

```bash
bash scripts/run_local.sh
```

Open `http://localhost:3000`, connect a wallet, deposit, then claim. The script
prints the local network details and a key to import. Locally the USDC stand-in
is freely mintable, so the Deposit page tops up your balance automatically.

On the Deposit page you pick how many 0.01 USDC notes to create (a batch of N
identical notes). Each note is saved separately and claimed independently. The
Claim page asks only for a note and a recipient address: the claim is submitted
gaslessly by the relayer, so the recipient wallet needs no QIE coin.

## C. Live Sepolia -> QIE testnet + Vercel

The live bridge moves real Sepolia USDC
(`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, 6 decimals). Fund the depositor
with Sepolia ETH + USDC (see `docs/FUNDING.md`; Circle faucet at
https://faucet.circle.com). Populate `./.env` (RPCs + keys), then:

```bash
bash scripts/deploy_testnet.sh          # deploy contracts, sync env, ship to Vercel
bash scripts/test_testnet_e2e.sh        # live deposit -> relayer -> gasless claim assertion
```

The deploy script wires the vault to real USDC (no token deploy), uses legacy gas
pricing, reuses an existing Poseidon hasher, and runs an upfront balance precheck
so it never half-spends. `SKIP_CONTRACTS=1` redeploys only the frontend.

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
