# Funding guide

You run the bridge from your own machine (deploys + relayer) with the frontend
hosted on Vercel. The bridge moves real Sepolia USDC privately to QIE in fixed
0.1 USDC notes. There are four logical roles. They can be separate keys or you
can reuse keys across roles. Below is exactly what to fund and where.

## Roles and what each needs

| Role | Chain | Needs | Why | Suggested amount |
|------|-------|-------|-----|------------------|
| Deployer | Sepolia + QIE | Sepolia ETH, QIE coin | Deploy the vault (Sepolia) and updater/pool/token/verifier (QIE) | 0.05 Sepolia ETH, small QIE |
| Depositor | Sepolia | Sepolia ETH + USDC | Approve + submit deposits; USDC is the bridged asset | 0.03 ETH + N x 0.1 USDC |
| Relayer (server) | QIE | QIE coin | Submit `updateRoot` and the gasless `withdraw` claims | small (fees near zero) |
| Claimer | (none) | nothing | Just an address that receives wrapped USDC | nothing |

The claim is gasless: the server relayer pays QIE gas for the withdraw, and the
proof binds the recipient, so the relayer cannot redirect funds. The claiming
wallet therefore needs no QIE coin and no Sepolia ETH.

Simplest setup: one key as deployer, your funded MetaMask as the depositor, the
relayer key on your machine / in Vercel, and a brand new address as the claimer.

## Concretely, fund these

On Sepolia:
- Deployer address: ETH for the one time vault deploy. Faucets: search
  "Sepolia faucet" (Google Cloud Web3, Alchemy, pk910 PoW).
- Depositor address: ETH for gas, plus USDC to bridge. Get Sepolia USDC from the
  Circle faucet: https://faucet.circle.com (select Ethereum Sepolia). Sepolia
  USDC is `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (6 decimals).

On QIE testnet (faucet: https://www.qie.digital/faucet):
- Deployer address: small amount for the contract deploys.
- Relayer address (the one behind `RELAYER_PRIVATE_KEY`): pays `updateRoot` and
  the gasless claims.

You do NOT fund the claimer. It receives wrapped USDC without ever paying gas.

## Important for privacy

The point is that the claimer is unlinkable to the depositor. Because claims are
gasless, the claim address never needs funding, so there is no funding trail to
correlate. Never send anything from the depositor to the recipient out of band,
or you reintroduce the on chain link you are trying to break.

## Get an address from its key

```bash
cast wallet address --private-key $RELAYER_PRIVATE_KEY
```
