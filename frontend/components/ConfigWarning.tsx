export function ConfigWarning({ what }: { what: string }) {
  return (
    <div className="glass relative overflow-hidden p-8 sm:p-10">
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-iris-500/20 blur-3xl" />
      <div className="relative flex flex-col items-center gap-4 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-300">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 8v5M12 16.5h.01" strokeLinecap="round" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-white">Contracts not loaded yet</h2>
          <p className="mx-auto max-w-sm text-sm text-slate-400">
            The {what} address has not been wired into this build. If a deployment just went out,
            give it a moment and refresh.
          </p>
        </div>
      </div>
    </div>
  );
}
