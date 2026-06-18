import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Docs - Veil Bridge",
  description: "How to use, how it works, and the architecture of the Veil Bridge.",
};

export default function DocsPage() {
  return (
    <div className="space-y-16">
      <header className="space-y-3">
        <span className="pill text-slate-300">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          Documentation
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-white">
          Bridge to QIE, <span className="gradient-text">privately</span>.
        </h1>
        <p className="max-w-2xl text-slate-400">
          Everything you need to use the bridge on testnet, understand the privacy model, and read
          the architecture end to end.
        </p>
        <nav className="flex flex-wrap gap-2 pt-2">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="pill text-slate-300 hover:text-white">
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      <Section id="use" eyebrow="Walkthrough" title="Use it on testnet">
        <p className="max-w-2xl text-slate-400">
          The bridge runs on Sepolia (source) and QIE testnet (destination). A full transfer takes
          two transactions from you plus an automated relayer step in between.
        </p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2">
          {useSteps.map((s, i) => (
            <li key={s.title} className="glass group relative p-6">
              <div className="flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 via-iris-500 to-indigo-500 text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <span className="pill text-slate-400">{s.tag}</span>
              </div>
              <h3 className="mt-4 text-base font-medium text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/deposit" className="btn-primary px-5 py-2.5">
            Make a deposit
          </Link>
          <Link href="/claim" className="btn-ghost px-5 py-2.5">
            Claim a note
          </Link>
        </div>
        <Callout tone="amber" title="Keep your note safe">
          The deposit produces a secret note. It is the only way to claim and it is shown once.
          Anyone who has it can claim the funds. Store it offline, claim from a fresh wallet.
        </Callout>
      </Section>

      <Section id="how" eyebrow="Concepts" title="How privacy is preserved">
        <p className="max-w-2xl text-slate-400">
          The bridge is a commitment and nullifier mixer joined to a zero knowledge light client. No
          single component sees both who deposited and who received.
        </p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {concepts.map((c) => (
            <div key={c.k} className="glass p-6">
              <h3 className="text-base font-medium text-white">{c.k}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{c.v}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Callout tone="brand" title="What is trusted">
            The destination verifies a proof that the source vault root is real, so the relayer
            cannot forge state. Trust reduces to the authenticity of the source block header,
            anchored to a finalized block.
          </Callout>
          <Callout tone="slate" title="What protects you">
            Your anonymity set is every deposit of the same denomination. Larger sets and a delay
            between deposit and claim, plus a freshly funded claim wallet, give the strongest
            privacy.
          </Callout>
        </div>
      </Section>

      <Section id="architecture" eyebrow="System" title="Architecture">
        <p className="max-w-2xl text-slate-400">
          Funds are locked on the source chain behind a commitment. A relayer proves the vault state
          into QIE. You then claim by proving membership in zero knowledge.
        </p>

        <div className="glass mt-8 overflow-x-auto p-6">
          <div className="flex min-w-[640px] items-stretch gap-3">
            <FlowNode tag="Sepolia" title="ShieldedVault" body="Locks denomination, stores Poseidon commitment in a Merkle tree." />
            <Arrow label="eth_getProof" />
            <FlowNode tag="Off chain" title="Relayer + SP1" body="Builds an inclusion proof of the vault root against the block header." />
            <Arrow label="updateRoot" />
            <FlowNode tag="QIE" title="BridgeUpdater" body="Verifies the proof and records the accepted root. The light client." />
            <Arrow label="claim" />
            <FlowNode tag="QIE" title="ShieldedPool" body="Verifies your Groth16 proof, burns the nullifier, mints wrapped tokens." />
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {layers.map((l) => (
            <div key={l.title} className="glass p-6">
              <span className="pill text-slate-400">{l.tag}</span>
              <h3 className="mt-3 text-base font-medium text-white">{l.title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-400">
                {l.items.map((it) => (
                  <li key={it} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

const sections = [
  { id: "use", label: "Use on testnet" },
  { id: "how", label: "How it works" },
  { id: "architecture", label: "Architecture" },
];

const useSteps = [
  {
    title: "Fund a Sepolia wallet",
    body: "Get test ETH from a Sepolia faucet. This wallet only pays gas for the deposit, it is never linked to the recipient.",
    tag: "Sepolia",
  },
  {
    title: "Connect and deposit",
    body: "Connect your wallet, open Deposit, and lock the fixed denomination. A secret note is generated in your browser.",
    tag: "Deposit",
  },
  {
    title: "Wait for the relayer",
    body: "The relayer proves the new vault root into QIE. This is automatic, it takes from seconds to a couple of minutes.",
    tag: "Relayer",
  },
  {
    title: "Claim from a fresh wallet",
    body: "On a new QIE wallet with its own gas, open Claim, paste the note, generate the proof locally, and receive wrapped tokens.",
    tag: "Claim",
  },
];

const concepts = [
  {
    k: "Commitment, not address",
    v: "A deposit registers Poseidon(nullifier, secret). The source chain never records where the funds are going.",
  },
  {
    k: "Nullifier, not identity",
    v: "A claim reveals only Poseidon(nullifier). It blocks double spends while staying unlinkable to the depositor.",
  },
  {
    k: "Membership in zero knowledge",
    v: "The claim proves the commitment is a leaf of a bridged Merkle root without revealing which leaf.",
  },
  {
    k: "Client side proving",
    v: "The Groth16 proof is generated in your browser from the circuit wasm and proving key. The secret never leaves your device.",
  },
];

const layers = [
  {
    tag: "Source chain",
    title: "Vaults",
    items: [
      "ShieldedVault locks a fixed denomination",
      "Incremental Poseidon Merkle tree with history",
      "Emits only a commitment, no recipient",
    ],
  },
  {
    tag: "Off chain",
    title: "Relayer",
    items: [
      "Reads the vault root with eth_getProof",
      "SP1 proves inclusion against the header",
      "Submits the proven root to QIE",
    ],
  },
  {
    tag: "Destination",
    title: "Shielded pool",
    items: [
      "BridgeUpdater records accepted roots",
      "ShieldedPool verifies the Groth16 claim",
      "WrappedToken minted to the recipient",
    ],
  },
];

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <p className="label text-brand-400">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function FlowNode({ tag, title, body }: { tag: string; title: string; body: string }) {
  return (
    <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <span className="pill text-slate-400">{tag}</span>
      <h4 className="mt-3 text-sm font-semibold text-white">{title}</h4>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{body}</p>
    </div>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex w-16 shrink-0 flex-col items-center justify-center gap-1">
      <span className="font-mono text-[10px] text-slate-500">{label}</span>
      <svg viewBox="0 0 40 12" className="h-3 w-10 text-brand-500" fill="none">
        <defs>
          <linearGradient id="arrowg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#e8388f" />
            <stop offset="100%" stopColor="#5b43d6" />
          </linearGradient>
        </defs>
        <path d="M0 6h34" stroke="url(#arrowg)" strokeWidth="1.5" />
        <path d="M30 2l6 4-6 4" stroke="url(#arrowg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: "amber" | "brand" | "slate";
  title: string;
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    amber: "border-amber-400/30 bg-amber-400/10 text-amber-100",
    brand: "border-brand-500/30 bg-brand-500/10 text-brand-200",
    slate: "border-white/10 bg-white/[0.03] text-slate-300",
  };
  return (
    <div className={`mt-6 rounded-2xl border px-5 py-4 ${tones[tone]}`}>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-sm leading-relaxed">{children}</p>
    </div>
  );
}
