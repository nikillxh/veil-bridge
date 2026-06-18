import { defineChain } from "viem";
import { sepolia } from "viem/chains";

const QIE_RPC = process.env.NEXT_PUBLIC_QIE_RPC_URL ?? "https://rpc1testnet.qie.digital/";
const SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

/// QIE testnet (chain id 1983), EVM compatible.
export const qieTestnet = defineChain({
  id: 1983,
  name: "QIE Testnet",
  nativeCurrency: { name: "QIE", symbol: "QIE", decimals: 18 },
  rpcUrls: { default: { http: [QIE_RPC] } },
  blockExplorers: {
    default: { name: "QIE Explorer", url: "https://testnet.qie.digital" },
  },
  testnet: true,
});

export const sepoliaChain = {
  ...sepolia,
  rpcUrls: {
    ...sepolia.rpcUrls,
    default: { http: [SEPOLIA_RPC] },
  },
};

export const SOURCE_CHAIN = sepoliaChain;
export const QIE_CHAIN = qieTestnet;
