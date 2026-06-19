import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  zeroHash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { QIE_CHAIN, SOURCE_CHAIN } from "@/lib/chains";
import { ADDRESSES, UPDATER_ABI, VAULT_ABI } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// On-demand bridging relay. Reads the current vault root on the source chain
/// and, in native verification mode (SP1MockVerifier accepts an empty proof),
/// submits it to BridgeUpdater on QIE so shielded claims can verify membership.
/// The relayer key lives only on the server; the route is idempotent so it does
/// not waste QIE gas re-submitting an already-accepted root.
export async function POST() {
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk) {
    return NextResponse.json({ ok: false, error: "relayer not configured" }, { status: 500 });
  }
  if (ADDRESSES.vault === "0x0000000000000000000000000000000000000000") {
    return NextResponse.json({ ok: false, error: "vault not configured" }, { status: 500 });
  }

  const sourceRpc = process.env.SEPOLIA_RPC_URL ?? SOURCE_CHAIN.rpcUrls.default.http[0];
  const qieRpc = process.env.QIE_RPC_URL ?? QIE_CHAIN.rpcUrls.default.http[0];

  const source = createPublicClient({ chain: SOURCE_CHAIN, transport: http(sourceRpc) });
  const qie = createPublicClient({ chain: QIE_CHAIN, transport: http(qieRpc) });

  try {
    const block = await source.getBlock({ blockTag: "latest" });
    const root = (await source.readContract({
      address: ADDRESSES.vault,
      abi: VAULT_ABI,
      functionName: "latestRoot",
      blockNumber: block.number,
    })) as Hex;

    if (!root || root === zeroHash) {
      return NextResponse.json({ ok: false, error: "no deposits yet" });
    }

    const already = (await qie.readContract({
      address: ADDRESSES.updater,
      abi: UPDATER_ABI,
      functionName: "isAcceptedRoot",
      args: [root],
    })) as boolean;
    if (already) {
      return NextResponse.json({ ok: true, already: true, root });
    }

    const publicValues = encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }],
      [block.hash as Hex, block.number, ADDRESSES.vault, root],
    );

    const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
    const wallet = createWalletClient({ account, chain: QIE_CHAIN, transport: http(qieRpc) });

    const hash = await wallet.writeContract({
      address: ADDRESSES.updater,
      abi: UPDATER_ABI,
      functionName: "updateRoot",
      args: [publicValues, "0x"],
      // QIE's eth_estimateGas under-reports for this call, which would cause an
      // out-of-gas revert; set an explicit, generous limit.
      gas: 500_000n,
    });
    const receipt = await qie.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      return NextResponse.json({ ok: false, error: "updateRoot reverted", tx: hash }, { status: 500 });
    }

    return NextResponse.json({ ok: true, root, tx: hash });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.shortMessage ?? e?.message ?? "relay failed" }, { status: 500 });
  }
}
