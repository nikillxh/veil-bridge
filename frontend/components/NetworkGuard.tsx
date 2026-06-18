"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
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
      <div className="glass flex flex-col items-center gap-4 p-10 text-center">
        <p className="text-slate-300">
          Wrong network. This step runs on <span className="text-white">{chainName}</span>.
        </p>
        <button
          onClick={() => switchChain({ chainId: chainId as 1983 | 11155111 })}
          disabled={isPending}
          className="btn-primary"
        >
          {isPending ? "Switching" : `Switch to ${chainName}`}
        </button>
        {error ? (
          <p className="max-w-sm text-xs text-rose-300">
            {error.message.includes("rejected")
              ? "Network switch was rejected."
              : `Could not switch automatically. Add ${chainName} to your wallet, then retry.`}
          </p>
        ) : null}
      </div>
    );
  }

  return <>{children}</>;
}
