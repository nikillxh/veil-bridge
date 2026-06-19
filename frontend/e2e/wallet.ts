import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  hexToBigInt,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const SEPOLIA_RPC =
  process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const QIE_RPC = process.env.QIE_RPC_URL ?? "https://rpc1testnet.qie.digital/";

const qie = defineChain({
  id: 1983,
  name: "QIE Testnet",
  nativeCurrency: { name: "QIE", symbol: "QIE", decimals: 18 },
  rpcUrls: { default: { http: [QIE_RPC] } },
});

const sepoliaChain = {
  ...sepolia,
  rpcUrls: { ...sepolia.rpcUrls, default: { http: [SEPOLIA_RPC] } },
};

function key(name: string): Hex {
  const v = process.env[name];
  if (!v) throw new Error(`missing ${name}`);
  return (v.startsWith("0x") ? v : `0x${v}`) as Hex;
}

/// A minimal EIP-1193 backend that signs with local testnet keys: the depositor
/// account on Sepolia and the (fresh) claimer account on QIE. Reads are proxied
/// to the real RPCs; eth_sendTransaction signs + broadcasts. Keys stay in Node;
/// the browser side only proxies requests to this handler.
export function createWalletBackend() {
  const depositor = privateKeyToAccount(key("DEPOSITOR_PRIVATE_KEY"));
  const claimer = privateKeyToAccount(key("CLAIMER_PRIVATE_KEY"));

  const ctx: Record<number, { pub: any; wal: any; account: any }> = {
    11155111: {
      pub: createPublicClient({ chain: sepoliaChain, transport: http(SEPOLIA_RPC) }),
      wal: createWalletClient({ account: depositor, chain: sepoliaChain, transport: http(SEPOLIA_RPC) }),
      account: depositor,
    },
    1983: {
      pub: createPublicClient({ chain: qie, transport: http(QIE_RPC) }),
      wal: createWalletClient({ account: claimer, chain: qie, transport: http(QIE_RPC) }),
      account: claimer,
    },
  };

  let chainId = 11155111;

  return async function handle(method: string, params: any[]): Promise<unknown> {
    const c = ctx[chainId];
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [c.account.address];
      case "eth_chainId":
        return "0x" + chainId.toString(16);
      case "net_version":
        return String(chainId);
      case "wallet_switchEthereumChain": {
        const next = parseInt(params[0].chainId, 16);
        if (ctx[next]) chainId = next;
        return null;
      }
      case "wallet_addEthereumChain":
      case "wallet_watchAsset":
        return null;
      case "eth_sendTransaction": {
        const tx = params[0] ?? {};
        return await c.wal.sendTransaction({
          account: c.account,
          to: tx.to as Hex,
          data: tx.data as Hex | undefined,
          value: tx.value ? hexToBigInt(tx.value as Hex) : undefined,
          // Honor a dApp-provided gas limit (the claim sets an explicit one for
          // QIE, whose estimator under-reports). Otherwise viem estimates.
          gas: tx.gas ? hexToBigInt(tx.gas as Hex) : undefined,
        });
      }
      default:
        // Proxy all read methods to the active chain's RPC.
        return await c.pub.request({ method, params });
    }
  };
}
