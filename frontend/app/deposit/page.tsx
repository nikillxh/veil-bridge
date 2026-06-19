"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { formatEther, formatUnits, zeroAddress } from "viem";
import { NetworkGuard } from "@/components/NetworkGuard";
import { Stepper, type Step } from "@/components/Stepper";
import { CopyField } from "@/components/CopyField";
import { ConfigWarning } from "@/components/ConfigWarning";
import { Modal } from "@/components/Modal";
import { SOURCE_CHAIN } from "@/lib/chains";
import { ADDRESSES, ERC20_ABI, VAULT_ABI } from "@/lib/contracts";
import { createNote, serializeNote, type Note } from "@/lib/note";
import { toBytes32 } from "@/lib/poseidon";
import { useBridge } from "@/lib/bridgeStore";

export default function DepositPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Private deposit</h1>
        <p className="max-w-2xl text-slate-400">
          Lock the fixed denomination on {SOURCE_CHAIN.name} behind a fresh commitment. Save the
          note that appears: it is the only way to claim, and it must stay secret.
        </p>
      </header>
      <NetworkGuard chainId={SOURCE_CHAIN.id} chainName={SOURCE_CHAIN.name}>
        <DepositFlow />
      </NetworkGuard>
    </div>
  );
}

function DepositFlow() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: SOURCE_CHAIN.id });
  const { writeContractAsync } = useWriteContract();

  const { deposit: state, setDeposit } = useBridge();
  const { busy, note, error, steps, txHash } = state;

  const configured = ADDRESSES.vault !== zeroAddress;

  const [info, setInfo] = useState<{
    symbol: string;
    decimals: number;
    denom: bigint;
    balance: bigint;
    isErc20: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!publicClient || !configured) return;
      try {
        const [token, denom] = (await Promise.all([
          publicClient.readContract({ address: ADDRESSES.vault, abi: VAULT_ABI, functionName: "token" }),
          publicClient.readContract({ address: ADDRESSES.vault, abi: VAULT_ABI, functionName: "denomination" }),
        ])) as [`0x${string}`, bigint];
        const isErc20 = token !== zeroAddress;
        let symbol: string = SOURCE_CHAIN.nativeCurrency.symbol;
        let decimals = 18;
        let balance = 0n;
        if (isErc20) {
          [symbol, decimals] = (await Promise.all([
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "symbol" }),
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" }),
          ])) as [string, number];
          if (address) {
            balance = (await publicClient.readContract({
              address: token,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [address],
            })) as bigint;
          }
        } else if (address) {
          balance = await publicClient.getBalance({ address });
        }
        if (!cancelled) setInfo({ symbol, decimals: Number(decimals), denom, balance, isErc20 });
      } catch {
        if (!cancelled) setInfo(null);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [publicClient, address, configured]);

  function setSteps(updater: (prev: Step[]) => Step[]) {
    setDeposit((s) => ({ ...s, steps: updater(s.steps) }));
  }
  function patch(i: number, s: Partial<Step>) {
    setSteps((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...s } : p)));
  }

  async function run() {
    if (!publicClient || !address) return;
    setDeposit((s) => ({
      ...s,
      busy: true,
      error: null,
      note: null,
      txHash: null,
      showSuccess: false,
      steps: [{ label: "Generate commitment", state: "active" }],
    }));

    try {
      const fresh = await createNote();
      const commitment = toBytes32(fresh.commitment);

      let token: `0x${string}`;
      let denom: bigint;
      try {
        [token, denom] = (await Promise.all([
          publicClient.readContract({ address: ADDRESSES.vault, abi: VAULT_ABI, functionName: "token" }),
          publicClient.readContract({
            address: ADDRESSES.vault,
            abi: VAULT_ABI,
            functionName: "denomination",
          }),
        ])) as [`0x${string}`, bigint];
      } catch {
        throw new Error(
          `Could not reach the vault on ${SOURCE_CHAIN.name}. Check your network connection and that the deployment is live, then retry.`,
        );
      }
      const isErc20 = token !== zeroAddress;

      const flow: Step[] = [
        { label: "Generate commitment", state: "done", detail: commitment },
        ...(isErc20
          ? ([
              { label: "Mint test tokens", state: "idle" },
              { label: "Approve vault", state: "idle" },
            ] as Step[])
          : []),
        { label: `Deposit ${formatEther(denom)} to vault`, state: "idle" },
        { label: "Bridge root to QIE", state: "idle" },
      ];
      setDeposit((s) => ({ ...s, steps: flow }));

      let cursor = 1;
      if (isErc20) {
        const bal = (await publicClient.readContract({
          address: token,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;
        if (bal < denom) {
          patch(cursor, { state: "active" });
          const h = await writeContractAsync({
            address: token,
            abi: ERC20_ABI,
            functionName: "mint",
            args: [address, denom],
          });
          await publicClient.waitForTransactionReceipt({ hash: h });
        }
        patch(cursor, { state: "done" });
        cursor++;

        patch(cursor, { state: "active" });
        const ah = await writeContractAsync({
          address: token,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ADDRESSES.vault, denom],
        });
        await publicClient.waitForTransactionReceipt({ hash: ah });
        patch(cursor, { state: "done" });
        cursor++;
      }

      patch(cursor, { state: "active" });
      const dh = await writeContractAsync({
        address: ADDRESSES.vault,
        abi: VAULT_ABI,
        functionName: "deposit",
        args: [commitment],
        value: isErc20 ? 0n : denom,
      });
      await publicClient.waitForTransactionReceipt({ hash: dh });
      patch(cursor, { state: "done" });
      cursor++;

      // Bridge the new root to QIE so the claim side is ready immediately.
      patch(cursor, { state: "active" });
      try {
        const res = await fetch("/api/relay", { method: "POST" });
        const body = await res.json().catch(() => ({}));
        patch(cursor, {
          state: res.ok ? "done" : "error",
          detail: res.ok ? undefined : body?.error ?? "relay failed",
        });
      } catch {
        // Non-fatal: the claim page also relays + retries.
        patch(cursor, { state: "error", detail: "Relay deferred; claim will retry." });
      }

      setDeposit((s) => ({ ...s, txHash: dh, note: fresh, showSuccess: true }));
    } catch (e: any) {
      const msg = e?.shortMessage ?? e?.message ?? "Transaction failed";
      setDeposit((s) => ({
        ...s,
        error: msg,
        steps: s.steps.map((p) => (p.state === "active" ? { ...p, state: "error" } : p)),
      }));
    } finally {
      setDeposit((s) => ({ ...s, busy: false }));
    }
  }

  if (!configured) {
    return <ConfigWarning what="vault" />;
  }

  return (
    <>
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="glass space-y-5 p-6 lg:col-span-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Create deposit</h2>
          <span className="pill text-slate-400">{SOURCE_CHAIN.name}</span>
        </div>
        <p className="text-sm leading-relaxed text-slate-400">
          A new random note is generated in your browser. The commitment is sent on chain; the
          secret never leaves this device.
        </p>

        <div className="rounded-xl border border-white/10 bg-ink-900/50 p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="label">Deposit amount</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {info ? `${formatUnits(info.denom, info.decimals)} ${info.symbol}` : "..."}
              </p>
            </div>
            <span className="pill text-slate-400">Fixed denomination</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {info?.isErc20
              ? "A fixed amount keeps every deposit identical, which is what gives the pool its anonymity set. Test tokens are minted to you automatically if your balance is low."
              : "A fixed amount keeps every deposit identical, which is what gives the pool its anonymity set."}
          </p>
          {info && address ? (
            <p className="mt-2 text-xs text-slate-500">
              Your balance: {formatUnits(info.balance, info.decimals)} {info.symbol}
            </p>
          ) : null}
        </div>

        <button onClick={run} disabled={busy} className="btn-primary w-full py-3">
          {busy ? "Working" : "Generate note and deposit"}
        </button>
        {error ? (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
        {steps.length > 0 ? (
          <div className="rounded-xl border border-white/10 bg-ink-900/50 p-4">
            <Stepper steps={steps} />
          </div>
        ) : null}
      </div>

      <div className="lg:col-span-2">
        {note ? (
          <div className="glass space-y-4 p-6">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <h2 className="text-lg font-medium text-white">Deposit confirmed</h2>
            </div>
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
              Save this note now. Anyone with it can claim. Losing it means losing the funds.
            </div>
            <CopyField label="Secret note" value={serializeNote(note)} />
            <button onClick={() => downloadNote(note)} className="btn-ghost w-full">
              Download note file
            </button>
            {txHash ? (
              <a
                href={`${SOURCE_CHAIN.blockExplorers?.default.url}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="block text-center text-xs text-brand-400 hover:underline"
              >
                View deposit transaction
              </a>
            ) : null}
          </div>
        ) : (
          <div className="glass flex h-full flex-col justify-center gap-3 p-6 text-sm text-slate-500">
            <p>Your secret note will appear here after a successful deposit.</p>
            <p>Keep it safe and claim later from a fresh wallet on QIE.</p>
          </div>
        )}
      </div>
    </div>

    <Modal
      open={state.showSuccess && !!note}
      onClose={() => setDeposit((s) => ({ ...s, showSuccess: false }))}
      title="Deposit confirmed"
      subtitle="Funds are locked. Save your secret note now to claim later."
    >
      {note ? (
        <>
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Anyone with this note can claim. Losing it means losing the funds.
          </div>
          <CopyField label="Secret note" value={serializeNote(note)} />
          <div className="flex gap-3">
            <button onClick={() => downloadNote(note)} className="btn-ghost flex-1">
              Download note
            </button>
            {txHash ? (
              <a
                href={`${SOURCE_CHAIN.blockExplorers?.default.url}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost flex-1"
              >
                View transaction
              </a>
            ) : null}
          </div>
        </>
      ) : null}
    </Modal>
    </>
  );
}

function downloadNote(note: Note) {
  const blob = new Blob([serializeNote(note)], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `veil-note-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
