"use client";

import { useState } from "react";

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="space-y-1.5">
      {label ? <div className="label">{label}</div> : null}
      <div className="flex items-stretch gap-2">
        <code className="field truncate">{value}</code>
        <button onClick={copy} className="btn-ghost shrink-0">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
