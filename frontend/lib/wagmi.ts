import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { QIE_CHAIN, SOURCE_CHAIN } from "./chains";

export const wagmiConfig = createConfig({
  chains: [SOURCE_CHAIN, QIE_CHAIN],
  // EIP-6963 discovery (on by default) surfaces every installed browser wallet
  // as its own connector; the bare injected() is the generic fallback.
  multiInjectedProviderDiscovery: true,
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [SOURCE_CHAIN.id]: http(SOURCE_CHAIN.rpcUrls.default.http[0]),
    [QIE_CHAIN.id]: http(QIE_CHAIN.rpcUrls.default.http[0]),
  },
  // Disable Multicall3 aggregation. wagmi batches concurrent reads into a call
  // to the canonical Multicall3 (0xca11...ca11), which is not deployed on our
  // local anvil chains or on QIE testnet, so the aggregated call returns "0x"
  // ("cannot decode zero data"). Plain per-call eth_call works on every chain.
  batch: { multicall: false },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
