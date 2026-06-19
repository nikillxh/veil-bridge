"use client";

import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { createPublicClient, http, zeroAddress } from "viem";
import { NetworkGuard } from "@/components/NetworkGuard";
import { Stepper, type Step } from "@/components/Stepper";
import { ConfigWarning } from "@/components/ConfigWarning";
import { Modal } from "@/components/Modal";
import { QIE_CHAIN, SOURCE_CHAIN } from "@/lib/chains";
import { ADDRESSES, MERKLE_LEVELS, POOL_ABI, UPDATER_ABI, VAULT_ABI } from "@/lib/contracts";
import { parseNote } from "@/lib/note";
import { PoseidonMerkleTree } from "@/lib/merkleTree";
import { buildWitnessInput, generateProof } from "@/lib/proof";
import { toBytes32 } from "@/lib/poseidon";
import { useBridge } from "@/lib/bridgeStore";

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

  const { claim: state, setClaim } = useBridge();
  const { noteInput, busy, error, steps, done } = state;

  const configured = ADDRESSES.pool !== zeroAddress && ADDRESSES.vault !== zeroAddress;

  function patch(i: number, s: Partial<Step>) {
    setClaim((c) => ({
      ...c,
      steps: c.steps.map((p, idx) => (idx === i ? { ...p, ...s } : p)),
    }));
  }

  async function run() {
    if (!qieClient || !address) return;
    setClaim((c) => ({
      ...c,
      busy: true,
      error: null,
      done: null,
      showSuccess: false,
      steps: [
        { label: "Parse note", state: "active" },
        { label: "Rebuild Merkle tree from deposits", state: "idle" },
        { label: "Check root is bridged to QIE", state: "idle" },
        { label: "Generate zero knowledge proof", state: "idle" },
        { label: "Submit claim", state: "idle" },
      ],
    }));

    try {
      const note = await parseNote(noteInput);
      patch(0, { state: "done" });

      // Rebuild tree from source chain Deposit events.
      patch(1, { state: "active" });
      const sourceClient = createPublicClient({
        chain: SOURCE_CHAIN,
        transport: http(SOURCE_CHAIN.rpcUrls.default.http[0]),
      });
      // Public RPCs cap eth_getLogs at 50k blocks; page through in safe windows.
      const latestBlock = await sourceClient.getBlockNumber();
      const STEP = 45000n;
      const logs: Awaited<ReturnType<typeof sourceClient.getContractEvents>> = [];
      for (let from = DEPLOY_BLOCK; from <= latestBlock; from += STEP + 1n) {
        const to = from + STEP > latestBlock ? latestBlock : from + STEP;
        const chunk = await sourceClient.getContractEvents({
          address: ADDRESSES.vault,
          abi: VAULT_ABI,
          eventName: "Deposit",
          fromBlock: from,
          toBlock: to,
        });
        logs.push(...chunk);
      }
      const ordered = logs
        .map((l) => ({
          index: Number((l as any).args.leafIndex),
          commitment: BigInt((l as any).args.commitment),
        }))
        .sort((a, b) => a.index - b.index)
        .map((x) => x.commitment);

      if (ordered.length === 0) {
        throw new Error("No deposits found in the vault yet.");
      }
      const myIndex = ordered.findIndex((c) => c === note.commitment);
      if (myIndex < 0) throw new Error("Commitment not found. Has the deposit been mined?");
      const tree = await PoseidonMerkleTree.create(MERKLE_LEVELS, ordered);
      const merkle = tree.proof(myIndex);
      patch(1, { state: "done", detail: `leaf #${myIndex}` });

      // Confirm the root has been bridged + accepted on QIE.
      patch(2, { state: "active" });
      const rootHex = toBytes32(tree.root);
      const checkAccepted = async () =>
        (await qieClient.readContract({
          address: ADDRESSES.updater,
          abi: UPDATER_ABI,
          functionName: "isAcceptedRoot",
          args: [rootHex],
        })) as boolean;

      let accepted: boolean;
      try {
        accepted = await checkAccepted();
      } catch {
        throw new Error(
          `Could not reach the bridge on ${QIE_CHAIN.name}. Check your network and retry.`,
        );
      }

      if (!accepted) {
        // Trigger the on-demand relay, then poll until the root is bridged.
        patch(2, { state: "active", detail: "Bridging root to QIE" });
        await fetch("/api/relay", { method: "POST" }).catch(() => {});
        for (let i = 0; i < 10 && !accepted; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          accepted = await checkAccepted().catch(() => false);
        }
      }
      if (!accepted) {
        throw new Error("Root not bridged to QIE yet. Try again in a moment.");
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
        // QIE's gas estimation under-reports for proof-verifying calls; set an
        // explicit, generous limit so the withdraw cannot run out of gas.
        gas: 1_500_000n,
      });
      const receipt = await qieClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("Claim transaction reverted on QIE.");
      }
      patch(4, { state: "done" });
      setClaim((c) => ({ ...c, done: hash, showSuccess: true }));
    } catch (e: any) {
      const msg = e?.shortMessage ?? e?.message ?? "Claim failed";
      setClaim((c) => ({
        ...c,
        error: msg,
        steps: c.steps.map((p) => (p.state === "active" ? { ...p, state: "error" } : p)),
      }));
    } finally {
      setClaim((c) => ({ ...c, busy: false }));
    }
  }

  if (!configured) return <ConfigWarning what="pool or vault" />;

  return (
    <>
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="glass space-y-5 p-6 lg:col-span-3">
        <h2 className="text-lg font-medium text-white">Your note</h2>
        <textarea
          value={noteInput}
          onChange={(e) => setClaim((c) => ({ ...c, noteInput: e.target.value }))}
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
                if (f) {
                  const text = (await f.text()).trim();
                  setClaim((c) => ({ ...c, noteInput: text }));
                }
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

    <Modal
      open={state.showSuccess && !!done}
      onClose={() => setClaim((c) => ({ ...c, showSuccess: false }))}
      title="Claim complete"
      subtitle="The shielded transfer settled on QIE."
    >
      <div className="flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-400/20 text-emerald-300">
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 10.5l3.5 3.5L15 6.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="text-sm text-emerald-100">Wrapped tokens minted to your wallet.</p>
      </div>
      {done ? (
        <a
          href={`${QIE_CHAIN.blockExplorers?.default.url}/tx/${done}`}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost w-full"
        >
          View transaction on QIE
        </a>
      ) : null}
    </Modal>
    </>
  );
}
