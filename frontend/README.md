# Veil Bridge frontend

Next.js 14 (App Router) + Tailwind + wagmi/viem. Deposit on Sepolia, claim on
QIE testnet. Groth16 proving runs in the browser via snarkjs.

## Local dev

```bash
npm install
cp .env.example .env.local   # fill in deployed addresses
npm run dev                  # http://localhost:3000
```

## Required environment variables

All are `NEXT_PUBLIC_*` (browser exposed). See [.env.example](.env.example):

- `NEXT_PUBLIC_SEPOLIA_RPC_URL`, `NEXT_PUBLIC_QIE_RPC_URL`
- `NEXT_PUBLIC_VAULT_ADDRESS`, `NEXT_PUBLIC_TOKEN_ADDRESS`
- `NEXT_PUBLIC_UPDATER_ADDRESS`, `NEXT_PUBLIC_POOL_ADDRESS`, `NEXT_PUBLIC_WRAPPED_ADDRESS`
- `NEXT_PUBLIC_MERKLE_LEVELS` (must match the vault), `NEXT_PUBLIC_VAULT_DEPLOY_BLOCK`

## Deploy to Vercel (production)

1. Push the repo to GitHub.
2. In Vercel, New Project, import the repo, and set the Root Directory to
   `frontend`. Framework preset: Next.js.
3. Add the `NEXT_PUBLIC_*` variables above under Project Settings, Environment
   Variables (Production).
4. Deploy. Vercel runs `next build` and serves the proving assets from
   `public/circuits/` automatically.

The circuit assets (`public/circuits/withdraw.wasm`,
`public/circuits/withdraw_final.zkey`) are committed to the repo on purpose so
Vercel ships them. Regenerate them with `cd ../circuits && npm run build` and
copy them here if the circuit changes.

## Notes

- The relayer is a separate process you run on your own machine; the frontend
  only does deposit and claim. The Claim page checks that the root has been
  bridged before proving, and tells you to wait for the relayer if it has not.
- Proving takes a few seconds and happens entirely client side.
