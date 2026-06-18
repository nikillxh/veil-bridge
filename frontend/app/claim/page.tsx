"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { createPublicClient, http, zeroAddress } from "viem";
import { NetworkGuard } from "@/components/NetworkGuard";
import { Stepper, type Step } from "@/components/Stepper";
import { ConfigWarning } from "@/components/ConfigWarning";
import { QIE_CHAIN, SOURCE_CHAIN } from "@/lib/chains";
import { ADDRESSES, MERKLE_LEVELS, POOL_ABI, UPDATER_ABI, VAULT_ABI } from "@/lib/contracts";
import { parseNote } from "@/lib/note";
import { PoseidonMerkleTree } from "@/lib/merkleTree";
import { buildWitnessInput, generateProof } from "@/lib/proof";
import { toBytes32 } from "@/lib/poseidon";

const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_VAULT_DEPLOY_BLOCK ?? "0");

export default function ClaimPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Shielded claim</h1>
        <p className="max-w-2xl text-slate-400">
          Paste your note and claim wrapped tokens on {QIE_CHAIN.name}. Use a fresh wallet with no
          link to the depositor. The proof is generated entirely in your browser.
        </p>
      </header>
      <NetworkGuard chainId={QIE_CHAIN.id} chainName={QIE_CHAIN.name}>
        <ClaimFlow />
      </NetworkGuard>
    </div>
  );
}

function ClaimFlow() {
  const { address } = useAccount();
  const qieClient = usePublicClient({ chainId: QIE_CHAIN.id });
  const { writeContractAsync } = useWriteContract();

  const [noteInput, setNoteInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const configured = ADDRESSES.pool !== zeroAddress && ADDRESSES.vault !== zeroAddress;

  function patch(i: number, s: Partial<Step>) {
    setSteps((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...s } : p)));
  }

  async function run() {
    if (!qieClient || !address) return;
    setBusy(true);
    setError(null);
    setDone(null);

    const flow: Step[] = [
      { label: "Parse note", state: "active" },
      { label: "Rebuild Merkle tree from deposits", state: "idle" },
      { label: "Check root is bridged to QIE", state: "idle" },
      { label: "Generate zero knowledge proof", state: "idle" },
      { label: "Submit claim", state: "idle" },
    ];
    setSteps(flow);

    try {
      const note = await parseNote(noteInput);
      patch(0, { state: "done" });

      // Rebuild tree from source chain Deposit events.
      patch(1, { state: "active" });
      const sourceClient = createPublicClient({ chain: SOURCE_CHAIN, transport: http() });
      const logs = await sourceClient.getContractEvents({
        address: ADDRESSES.vault,
        abi: VAULT_ABI,
        eventName: "Deposit",
        fromBlock: DEPLOY_BLOCK,
        toBlock: "latest",
      });
      const ordered = logs
        .map((l) => ({
          index: Number((l as any).args.leafIndex),
          commitment: BigInt((l as any).args.commitment),
        }))
        .sort((a, b) => a.index - b.index)
        .map((x) => x.commitment);

      const myIndex = ordered.findIndex((c) => c === note.commitment);
      if (myIndex < 0) throw new Error("Commitment not found. Has the deposit been mined?");
      const tree = await PoseidonMerkleTree.create(MERKLE_LEVELS, ordered);
      const merkle = tree.proof(myIndex);
      patch(1, { state: "done", detail: `leaf #${myIndex}` });

      // Confirm the root has been bridged + accepted on QIE.
      patch(2, { state: "active" });
      const rootHex = toBytes32(tree.root);
      const accepted = (await qieClient.readContract({
        address: ADDRESSES.updater,
        abi: UPDATER_ABI,
        functionName: "isAcceptedRoot",
        args: [rootHex],
      })) as boolean;
      if (!accepted) {
        throw new Error("Root not yet bridged to QIE. Wait for the relayer, then retry.");
      }
      patch(2, { state: "done", detail: rootHex });

      // Prove membership client side.
      patch(3, { state: "active" });
      const input = buildWitnessInput(note, merkle, {
        recipient: BigInt(address),
        relayer: 0n,
        fee: 0n,
        refund: 0n,
      });
      const proof = await generateProof(input);
      patch(3, { state: "done" });

      // Submit the withdraw on QIE.
      patch(4, { state: "active" });
      const hash = await writeContractAsync({
        address: ADDRESSES.pool,
        abi: POOL_ABI,
        functionName: "withdraw",
        args: [
          proof.pA,
          proof.pB,
          proof.pC,
          rootHex,
          toBytes32(note.nullifierHash),
          address,
          zeroAddress,
          0n,
          0n,
        ],
      });
      await qieClient.waitForTransactionReceipt({ hash });
      patch(4, { state: "done" });
      setDone(hash);
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? "Claim failed");
      setSteps((prev) => prev.map((p) => (p.state === "active" ? { ...p, state: "error" } : p)));
    } finally {
      setBusy(false);
    }
  }

  if (!configured) return <ConfigWarning what="pool or vault" />;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="glass space-y-5 p-6 lg:col-span-3">
        <h2 className="text-lg font-medium text-white">Your note</h2>
        <textarea
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          placeholder="qie-note-v1:..."
          rows={3}
          className="field resize-none"
        />
        <div className="flex items-center gap-3">
          <label className="btn-ghost cursor-pointer">
            Upload file
            <input
              type="file"
              accept=".txt"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setNoteInput((await f.text()).trim());
              }}
            />
          </label>
          <button onClick={run} disabled={busy || !noteInput} className="btn-primary flex-1 py-3">
            {busy ? "Claiming" : "Generate proof and claim"}
          </button>
        </div>
        {error ? (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
      </div>

      <div className="lg:col-span-2">
        {steps.length > 0 ? (
          <div className="glass space-y-4 p-6">
            <h2 className="text-lg font-medium text-white">Progress</h2>
            <Stepper steps={steps} />
            {done ? (
              <a
                href={`${QIE_CHAIN.blockExplorers?.default.url}/tx/${done}`}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-center text-sm text-emerald-200 hover:bg-emerald-400/15"
              >
                Claimed. View transaction on QIE
              </a>
            ) : null}
          </div>
        ) : (
          <div className="glass flex h-full flex-col justify-center gap-3 p-6 text-sm text-slate-500">
            <p>Proving happens locally in your browser using the circuit wasm and proving key.</p>
            <p>Expect a few seconds for proof generation.</p>
          </div>
        )}
      </div>
    </div>
  );
}
