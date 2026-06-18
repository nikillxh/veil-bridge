export type StepState = "idle" | "active" | "done" | "error";

export interface Step {
  label: string;
  state: StepState;
  detail?: string;
}

export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3">
          <span
            className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-semibold ${
              s.state === "done"
                ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300"
                : s.state === "active"
                  ? "border-brand-400/50 bg-brand-400/15 text-brand-200 animate-pulse"
                  : s.state === "error"
                    ? "border-rose-400/40 bg-rose-400/15 text-rose-300"
                    : "border-white/10 bg-white/[0.03] text-slate-500"
            }`}
          >
            {s.state === "done" ? "✓" : s.state === "error" ? "!" : i + 1}
          </span>
          <div className="pt-0.5">
            <div
              className={`text-sm ${s.state === "idle" ? "text-slate-500" : "text-slate-100"}`}
            >
              {s.label}
            </div>
            {s.detail ? (
              <div className="mt-0.5 break-all font-mono text-xs text-slate-500">{s.detail}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
