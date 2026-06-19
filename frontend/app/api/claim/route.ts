import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, getAddress, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { QIE_CHAIN } from "@/lib/chains";
import { ADDRESSES, POOL_ABI } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ClaimBody {
  pA: [string, string];
  pB: [[string, string], [string, string]];
  pC: [string, string];
  root: Hex;
  nullifierHash: Hex;
  recipient: Hex;
  relayer: Hex;
  fee: string;
  refund: string;
}

const big = (v: string) => BigInt(v);

/// Gasless claim submitter. The browser generates the Groth16 proof, which binds
/// `recipient`, `relayer`, and `fee` as public inputs. This route forwards the
/// proof to ShieldedPool.withdraw and pays QIE gas from the server relayer key,
/// so the claiming wallet needs no QIE coin. The proof prevents the server from
/// redirecting funds (recipient is committed in the proof).
export async function POST(req: Request) {
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk) {
    return NextResponse.json({ ok: false, error: "relayer not configured" }, { status: 500 });
  }
  if (ADDRESSES.pool === "0x0000000000000000000000000000000000000000") {
    return NextResponse.json({ ok: false, error: "pool not configured" }, { status: 500 });
  }

  let body: ClaimBody;
  try {
    body = (await req.json()) as ClaimBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const qieRpc = process.env.QIE_RPC_URL ?? QIE_CHAIN.rpcUrls.default.http[0];
  const qie = createPublicClient({ chain: QIE_CHAIN, transport: http(qieRpc) });

  try {
    const recipient = getAddress(body.recipient);
    const relayer = getAddress(body.relayer);
    const fee = big(body.fee);
    const refund = big(body.refund);

    const denomination = (await qie.readContract({
      address: ADDRESSES.pool,
      abi: POOL_ABI,
      functionName: "denomination",
    })) as bigint;
    if (fee > denomination) {
      return NextResponse.json({ ok: false, error: "fee exceeds denomination" }, { status: 400 });
    }

    const spent = (await qie.readContract({
      address: ADDRESSES.pool,
      abi: POOL_ABI,
      functionName: "nullifierSpent",
      args: [body.nullifierHash],
    })) as boolean;
    if (spent) {
      return NextResponse.json({ ok: false, error: "note already claimed" }, { status: 409 });
    }

    const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
    const wallet = createWalletClient({ account, chain: QIE_CHAIN, transport: http(qieRpc) });

    const hash = await wallet.writeContract({
      address: ADDRESSES.pool,
      abi: POOL_ABI,
      functionName: "withdraw",
      args: [
        [big(body.pA[0]), big(body.pA[1])],
        [
          [big(body.pB[0][0]), big(body.pB[0][1])],
          [big(body.pB[1][0]), big(body.pB[1][1])],
        ],
        [big(body.pC[0]), big(body.pC[1])],
        body.root,
        body.nullifierHash,
        recipient,
        relayer,
        fee,
        refund,
      ],
      // QIE's eth_estimateGas under-reports for proof-verifying calls; set an
      // explicit, generous limit so the withdraw cannot run out of gas.
      gas: 1_500_000n,
    });
    const receipt = await qie.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      return NextResponse.json({ ok: false, error: "claim reverted", tx: hash }, { status: 500 });
    }

    return NextResponse.json({ ok: true, tx: hash });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.shortMessage ?? e?.message ?? "claim failed" },
      { status: 500 },
    );
  }
}
