"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/// Themed dialog rendered through a portal to document.body so a backdrop-filter
/// ancestor (the sticky header) cannot become its containing block. Matches the
/// site glass theme with a logo-gradient header bar.
export function Modal({ open, onClose, title, subtitle, children }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="glass w-full max-w-md overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-gradient-to-r from-brand-500/20 via-iris-500/15 to-indigo-500/20 px-6 py-5">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-300">{subtitle}</p> : null}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 text-slate-400 transition hover:text-white"
          >
            <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
