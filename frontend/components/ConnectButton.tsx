"use client";

import { useAccount, useChains, useConnect, useDisconnect } from "wagmi";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Connector } from "wagmi";

function shorten(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/// Wallet connection control.
///
/// Disconnected: opens a modal listing every wallet the browser exposes via
/// EIP-6963 (MetaMask, Rabby, Coinbase, Brave, ...) plus a generic injected
/// fallback. Connected: shows the active account with a dropdown to copy the
/// address, view it on the explorer, or disconnect.
export function ConnectButton() {
  const { address, isConnected, chainId, connector: active } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chains = useChains();

  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (isConnected) setModalOpen(false);
  }, [isConnected]);

  const wallets = dedupeConnectors(connectors);
  const explorer = chains.find((c) => c.id === chainId)?.blockExplorers?.default.url;
  const chainName = chains.find((c) => c.id === chainId)?.name;

  async function onConnect(connector: Connector) {
    setPendingId(connector.uid);
    try {
      await connect({ connector });
    } finally {
      setPendingId(null);
    }
  }

  if (isConnected && address) {
    return (
      <div ref={menuRef} className="relative">
        <button onClick={() => setMenuOpen((o) => !o)} className="btn-ghost group">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" />
          <span className="font-mono">{shorten(address)}</span>
          <svg
            viewBox="0 0 12 12"
            className={`h-3 w-3 text-slate-500 transition ${menuOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M2.5 4.5 6 8l3.5-3.5" />
          </svg>
        </button>

        {menuOpen ? (
          <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-white/10 bg-ink-900/95 p-1.5 shadow-2xl backdrop-blur">
            <div className="px-3 py-2.5">
              <p className="text-xs text-slate-500">Connected{active ? ` with ${active.name}` : ""}</p>
              <p className="truncate font-mono text-sm text-white">{address}</p>
              {chainName ? (
                <span className="pill mt-2 inline-flex text-slate-400">{chainName}</span>
              ) : null}
            </div>
            <div className="my-1 h-px bg-white/10" />
            <button
              onClick={() => {
                navigator.clipboard.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
              className="menu-item"
            >
              {copied ? "Copied" : "Copy address"}
            </button>
            {explorer ? (
              <a
                href={`${explorer}/address/${address}`}
                target="_blank"
                rel="noreferrer"
                className="menu-item"
              >
                View on explorer
              </a>
            ) : null}
            <button
              onClick={() => {
                disconnect();
                setMenuOpen(false);
              }}
              className="menu-item text-rose-300 hover:text-rose-200"
            >
              Disconnect
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setModalOpen(true)} disabled={isPending} className="btn-primary">
        {isPending ? "Connecting" : "Connect wallet"}
      </button>

      {modalOpen && mounted
        ? createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="glass w-full max-w-sm space-y-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-white">Connect a wallet</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-500 transition hover:text-slate-300"
                aria-label="Close"
              >
                <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>

            {wallets.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-ink-900/50 p-4 text-sm text-slate-400">
                No wallet detected. Install a browser wallet such as{" "}
                <a className="text-brand-400 hover:underline" href="https://metamask.io" target="_blank" rel="noreferrer">
                  MetaMask
                </a>{" "}
                and reload.
              </div>
            ) : (
              <div className="space-y-2">
                {wallets.map((c) => (
                  <button
                    key={c.uid}
                    onClick={() => onConnect(c)}
                    disabled={pendingId !== null}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-brand-400/40 hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    {c.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.icon} alt="" className="h-7 w-7 rounded-md" />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500/20 text-sm font-semibold text-brand-300">
                        {c.name.slice(0, 1)}
                      </span>
                    )}
                    <span className="flex-1 font-medium text-white">{c.name}</span>
                    {pendingId === c.uid ? (
                      <span className="text-xs text-slate-400">Connecting</span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}

            {error ? (
              <p className="text-sm text-rose-300">{error.message}</p>
            ) : (
              <p className="text-xs text-slate-500">
                By connecting you agree this is testnet software. Never use a mainnet wallet with
                real funds.
              </p>
            )}
          </div>
        </div>,
            document.body,
          )
        : null}
    </>
  );
}

/// Collapse duplicate connectors (a generic "injected" plus its EIP-6963 entry)
/// down to one button per wallet name.
function dedupeConnectors(connectors: readonly Connector[]): Connector[] {
  const byName = new Map<string, Connector>();
  for (const c of connectors) {
    const key = c.name.toLowerCase();
    const existing = byName.get(key);
    // Prefer the EIP-6963 entry (has an icon) over the bare injected fallback.
    if (!existing || (!existing.icon && c.icon)) byName.set(key, c);
  }
  return [...byName.values()];
}
