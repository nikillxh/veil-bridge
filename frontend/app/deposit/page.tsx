"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { formatUnits, zeroAddress } from "viem";
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

// Local runs deploy a freely-mintable USDC stand-in; on testnet this is unset so
// the user funds from a faucet instead.
const MINTABLE = process.env.NEXT_PUBLIC_TOKEN_MINTABLE === "1";
const MAX_NOTES = 10;
const FAUCET_URL = "https://faucet.circle.com";

export default function DepositPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Private deposit</h1>
        <p className="max-w-2xl text-slate-400">
          Lock USDC on {SOURCE_CHAIN.name} behind fresh commitments. Each note is an identical
          fixed amount, so every deposit looks the same and the anonymity set stays strong. Choose
          how many notes to create. Save every note that appears: each is the only way to claim.
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
  const { busy, notes, error, steps, txHash } = state;

  const configured = ADDRESSES.vault !== zeroAddress;

  const [count, setCount] = useState(1);
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
  }, [publicClient, address, configured, txHash]);

  function patch(i: number, s: Partial<Step>) {
    setDeposit((prev) => ({
      ...prev,
      steps: prev.steps.map((p, idx) => (idx === i ? { ...p, ...s } : p)),
    }));
  }

  async function run() {
    if (!publicClient || !address) return;
    const n = Math.min(Math.max(count, 1), MAX_NOTES);
    setDeposit((s) => ({
      ...s,
      busy: true,
      error: null,
      notes: [],
      txHash: null,
      showSuccess: false,
      steps: [],
    }));

    try {
      let token: `0x${string}`;
      let denom: bigint;
      try {
        [token, denom] = (await Promise.all([
          publicClient.readContract({ address: ADDRESSES.vault, abi: VAULT_ABI, functionName: "token" }),
          publicClient.readContract({ address: ADDRESSES.vault, abi: VAULT_ABI, functionName: "denomination" }),
        ])) as [`0x${string}`, bigint];
      } catch {
        throw new Error(
          `Could not reach the vault on ${SOURCE_CHAIN.name}. Check your network connection and that the deployment is live, then retry.`,
        );
      }
      const isErc20 = token !== zeroAddress;
      const decimals = info?.decimals ?? 18;
      const symbol = info?.symbol ?? "tokens";
      const total = denom * BigInt(n);
      const fmt = (v: bigint) => `${formatUnits(v, decimals)} ${symbol}`;

      let balance = 0n;
      if (isErc20) {
        balance = (await publicClient.readContract({
          address: token,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;
      } else {
        balance = await publicClient.getBalance({ address });
      }
      const needFunds = balance < total;

      const flow: Step[] = [];
      if (isErc20 && needFunds && MINTABLE) flow.push({ label: `Mint ${fmt(total)}`, state: "idle" });
      if (isErc20) flow.push({ label: `Approve ${fmt(total)}`, state: "idle" });
      for (let i = 0; i < n; i++) {
        flow.push({ label: `Deposit note ${i + 1} of ${n} (${fmt(denom)})`, state: "idle" });
      }
      flow.push({ label: "Bridge root to QIE", state: "idle" });
      setDeposit((s) => ({ ...s, steps: flow }));

      let cursor = 0;

      if (isErc20 && needFunds) {
        if (!MINTABLE) {
          throw new Error(
            `You need ${fmt(total)} but hold ${fmt(balance)}. Get testnet USDC from the Circle faucet (${FAUCET_URL}), then retry.`,
          );
        }
        patch(cursor, { state: "active" });
        const mh = await writeContractAsync({
          address: token,
          abi: ERC20_ABI,
          functionName: "mint",
          args: [address, total - balance],
        });
        await publicClient.waitForTransactionReceipt({ hash: mh });
        patch(cursor, { state: "done" });
        cursor++;
      }

      if (isErc20) {
        patch(cursor, { state: "active" });
        const ah = await writeContractAsync({
          address: token,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ADDRESSES.vault, total],
        });
        await publicClient.waitForTransactionReceipt({ hash: ah });
        patch(cursor, { state: "done" });
        cursor++;
      }

      const collected: Note[] = [];
      let lastTx: string | null = null;
      for (let i = 0; i < n; i++) {
        patch(cursor, { state: "active" });
        const fresh = await createNote();
        const commitment = toBytes32(fresh.commitment);
        const dh = await writeContractAsync({
          address: ADDRESSES.vault,
          abi: VAULT_ABI,
          functionName: "deposit",
          args: [commitment],
          value: isErc20 ? 0n : denom,
        });
        await publicClient.waitForTransactionReceipt({ hash: dh });
        collected.push(fresh);
        lastTx = dh;
        patch(cursor, { state: "done", detail: commitment });
        cursor++;
      }

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
        patch(cursor, { state: "error", detail: "Relay deferred; claim will retry." });
      }

      setDeposit((s) => ({ ...s, txHash: lastTx, notes: collected, showSuccess: true }));
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

  const perNote = info ? `${formatUnits(info.denom, info.decimals)} ${info.symbol}` : "...";
  const total = info ? `${formatUnits(info.denom * BigInt(count), info.decimals)} ${info.symbol}` : "...";

  return (
    <>
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="glass space-y-5 p-6 lg:col-span-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Create deposit</h2>
          <span className="pill text-slate-400">{SOURCE_CHAIN.name}</span>
        </div>
        <p className="text-sm leading-relaxed text-slate-400">
          Fresh random notes are generated in your browser. The commitments are sent on chain; the
          secrets never leave this device.
        </p>

        <div className="rounded-xl border border-white/10 bg-ink-900/50 p-4 space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="label">Amount per note</p>
              <p className="mt-1 text-2xl font-semibold text-white">{perNote}</p>
            </div>
            <span className="pill text-slate-400">Fixed denomination</span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="label">Number of notes</p>
              <p className="mt-1 text-xs text-slate-500">Each note is bridged and claimed separately.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCount((c) => Math.max(1, c - 1))}
                disabled={busy || count <= 1}
                className="btn-ghost h-9 w-9 p-0 text-lg"
                aria-label="Fewer notes"
              >
                -
              </button>
              <span className="w-8 text-center font-mono text-lg text-white">{count}</span>
              <button
                type="button"
                onClick={() => setCount((c) => Math.min(MAX_NOTES, c + 1))}
                disabled={busy || count >= MAX_NOTES}
                className="btn-ghost h-9 w-9 p-0 text-lg"
                aria-label="More notes"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-3">
            <p className="label">Total to deposit</p>
            <p className="text-lg font-semibold text-white">{total}</p>
          </div>

          {info && address ? (
            <p className="text-xs text-slate-500">
              Your balance: {formatUnits(info.balance, info.decimals)} {info.symbol}
              {!MINTABLE ? (
                <>
                  {" - "}
                  <a className="text-brand-400 hover:underline" href={FAUCET_URL} target="_blank" rel="noreferrer">
                    get testnet USDC
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
          {count > 1 ? (
            <p className="text-xs text-slate-500">
              Heads up: {count} notes means {count} separate on-chain deposits (more gas).
            </p>
          ) : null}
        </div>

        <button onClick={run} disabled={busy} className="btn-primary w-full py-3">
          {busy ? "Working" : count > 1 ? `Generate ${count} notes and deposit` : "Generate note and deposit"}
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
        {notes.length > 0 ? (
          <div className="glass space-y-4 p-6">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <h2 className="text-lg font-medium text-white">
                {notes.length === 1 ? "Deposit confirmed" : `${notes.length} deposits confirmed`}
              </h2>
            </div>
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
              Save {notes.length === 1 ? "this note" : "every note"} now. Anyone with a note can
              claim it. Losing one means losing those funds.
            </div>
            <div className="space-y-3">
              {notes.map((n, i) => (
                <CopyField
                  key={i}
                  label={notes.length === 1 ? "Secret note" : `Secret note ${i + 1}`}
                  value={serializeNote(n)}
                />
              ))}
            </div>
            <button onClick={() => downloadNotes(notes)} className="btn-ghost w-full">
              Download {notes.length === 1 ? "note file" : "all notes"}
            </button>
            {txHash ? (
              <a
                href={`${SOURCE_CHAIN.blockExplorers?.default.url}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="block text-center text-xs text-brand-400 hover:underline"
              >
                View last deposit transaction
              </a>
            ) : null}
          </div>
        ) : (
          <div className="glass flex h-full flex-col justify-center gap-3 p-6 text-sm text-slate-500">
            <p>Your secret notes will appear here after a successful deposit.</p>
            <p>Keep them safe and claim later from a fresh wallet on QIE.</p>
          </div>
        )}
      </div>
    </div>

    <Modal
      open={state.showSuccess && notes.length > 0}
      onClose={() => setDeposit((s) => ({ ...s, showSuccess: false }))}
      title={notes.length === 1 ? "Deposit confirmed" : `${notes.length} deposits confirmed`}
      subtitle="Funds are locked. Save your secret notes now to claim later."
    >
      {notes.length > 0 ? (
        <>
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Anyone with a note can claim it. Losing one means losing those funds.
          </div>
          <div className="max-h-64 space-y-3 overflow-y-auto">
            {notes.map((n, i) => (
              <CopyField
                key={i}
                label={notes.length === 1 ? "Secret note" : `Secret note ${i + 1}`}
                value={serializeNote(n)}
              />
            ))}
          </div>
          <button onClick={() => downloadNotes(notes)} className="btn-ghost w-full">
            Download {notes.length === 1 ? "note" : "all notes"}
          </button>
        </>
      ) : null}
    </Modal>
    </>
  );
}

function downloadNotes(notes: Note[]) {
  const blob = new Blob([notes.map(serializeNote).join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `veil-notes-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
