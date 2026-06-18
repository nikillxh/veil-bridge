# Funding guide

You run the bridge from your own machine (deploys + relayer) with the frontend
hosted on Vercel. There are five logical roles. They can be five different keys
or you can reuse keys across roles. Below is exactly what to fund and where.

## Roles and what each needs

| Role | Chain | Needs gas on | Why | Suggested amount |
|------|-------|--------------|-----|------------------|
| Deployer (source) | Sepolia | Sepolia ETH | Deploy Poseidon hasher + ShieldedVault | 0.05 ETH |
| Deployer (QIE) | QIE testnet | QIE testnet coin | Deploy updater, pool, token, verifier | small (fees are near zero) |
| Depositor | Sepolia | Sepolia ETH | Submit the deposit transaction (the test token is free to mint) | 0.02 ETH |
| Relayer | QIE testnet | QIE testnet coin | Submit `updateRoot` proofs | small |
| Claimer | QIE testnet | QIE testnet coin | Submit the `withdraw` claim from a fresh wallet | small |

Simplest setup: use one key as both deployers, your MetaMask as depositor, the
relayer key on your machine, and a brand new wallet as the claimer.

## Concretely, fund these

On Sepolia (get test ETH from a Sepolia faucet):
- The deployer address
- The depositor address (your MetaMask account used on the Deposit page)

On QIE testnet (faucet: https://www.qie.digital/faucet):
- The deployer address
- The relayer address (the one behind `RELAYER_PRIVATE_KEY`)
- The claimer address (the fresh wallet used on the Claim page)

## Important for privacy

The whole point is that the claimer is unlinkable to the depositor. Fund the
claimer's QIE gas from a faucet, never by sending from the depositor. If you
top up the claimer from the depositor, you reintroduce the on chain link you are
trying to break.

## Get the relayer address from its key

```bash
cast wallet address --private-key $RELAYER_PRIVATE_KEY
```

## Sepolia faucets

Any Sepolia faucet works (Google Cloud Web3 faucet, Alchemy, pk910 PoW faucet).
Search "Sepolia faucet" and send to the deployer and depositor addresses.
