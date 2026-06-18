export function ConfigWarning({ what }: { what: string }) {
  return (
    <div className="glass p-8 text-center text-slate-400">
      The {what} address is not configured. Set the NEXT_PUBLIC_*_ADDRESS environment variables in
      Vercel after deploying the contracts.
    </div>
  );
}
