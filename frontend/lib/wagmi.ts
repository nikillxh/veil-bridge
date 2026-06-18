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
    [SOURCE_CHAIN.id]: http(),
    [QIE_CHAIN.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
