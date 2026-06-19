import type { Address } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

function addr(v: string | undefined): Address {
  return (v && v.length > 0 ? v : ZERO) as Address;
}

/// Deployed addresses, injected at build time via NEXT_PUBLIC_* env vars.
/// These must be read with static `process.env.NEXT_PUBLIC_*` member access so
/// Next.js inlines the literals into the client bundle (dynamic key access is
/// never inlined and resolves to undefined in the browser).
export const ADDRESSES = {
  vault: addr(process.env.NEXT_PUBLIC_VAULT_ADDRESS),
  token: addr(process.env.NEXT_PUBLIC_TOKEN_ADDRESS),
  updater: addr(process.env.NEXT_PUBLIC_UPDATER_ADDRESS),
  pool: addr(process.env.NEXT_PUBLIC_POOL_ADDRESS),
  wrapped: addr(process.env.NEXT_PUBLIC_WRAPPED_ADDRESS),
} as const;

export const MERKLE_LEVELS = Number(process.env.NEXT_PUBLIC_MERKLE_LEVELS ?? "20");

export const VAULT_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [],
  },
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "denomination",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "latestRoot",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "leafIndex", type: "uint32", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

export const POOL_ABI = [
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pA", type: "uint256[2]" },
      { name: "pB", type: "uint256[2][2]" },
      { name: "pC", type: "uint256[2]" },
      { name: "root", type: "bytes32" },
      { name: "nullifierHash", type: "bytes32" },
      { name: "recipient", type: "address" },
      { name: "relayer", type: "address" },
      { name: "fee", type: "uint256" },
      { name: "refund", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "nullifierSpent",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "denomination",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const UPDATER_ABI = [
  {
    type: "function",
    name: "isAcceptedRoot",
    stateMutability: "view",
    inputs: [{ name: "root", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "updateRoot",
    stateMutability: "nonpayable",
    inputs: [
      { name: "publicValues", type: "bytes" },
      { name: "proofBytes", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;
