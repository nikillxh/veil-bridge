"use client";

import { useAccount, useChainId, useChains, useSwitchChain } from "wagmi";
import type { ReactNode } from "react";
import { ConnectButton } from "./ConnectButton";

export function NetworkGuard({
  chainId,
  chainName,
  children,
}: {
  chainId: number;
  chainName: string;
  children: ReactNode;
}) {
  const { isConnected } = useAccount();
  const current = useChainId();
  const chains = useChains();
  const currentName = chains.find((c) => c.id === current)?.name;
  const { switchChain, isPending, error } = useSwitchChain();

  if (!isConnected) {
    return (
      <div className="glass flex flex-col items-center gap-4 p-10 text-center">
        <p className="text-slate-400">Connect a wallet to continue.</p>
        <ConnectButton />
      </div>
    );
  }

  if (current !== chainId) {
    return (
      <div className="glass relative overflow-hidden p-8 sm:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="relative flex flex-col items-center gap-5 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 via-iris-500 to-indigo-500 text-white shadow-[0_8px_24px_-8px_rgba(232,56,143,0.6)]">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 8h13l-3-3M20 16H7l3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-white">Switch to {chainName}</h2>
            <p className="mx-auto max-w-sm text-sm text-slate-400">
              This step settles on <span className="text-slate-200">{chainName}</span>. Switch
              networks to continue. Your progress on this page is kept.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="pill text-slate-400">Now: {currentName ?? `chain ${current}`}</span>
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="pill border-brand-500/40 text-brand-200">{chainName}</span>
          </div>
          <button
            onClick={() => switchChain({ chainId: chainId as 1983 | 11155111 })}
            disabled={isPending}
            className="btn-primary px-6 py-3"
          >
            {isPending ? "Confirm in wallet" : `Switch to ${chainName}`}
          </button>
          {error ? (
            <p className="max-w-sm text-xs text-rose-300">
              {error.message.includes("rejected")
                ? "Network switch was rejected in your wallet."
                : `Could not switch automatically. Add ${chainName} to your wallet, then retry.`}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
