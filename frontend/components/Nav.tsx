"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "./ConnectButton";

const links = [
  { href: "/", label: "Overview" },
  { href: "/deposit", label: "Deposit" },
  { href: "/claim", label: "Claim" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 via-iris-500 to-indigo-500 text-white shadow-[0_4px_14px_-4px_rgba(232,56,143,0.6)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 2 4 7v10l8 5 8-5V7l-8-5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M12 7v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-white">
            Veil<span className="gradient-text">Bridge</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  active ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <ConnectButton />
      </div>
    </header>
  );
}
