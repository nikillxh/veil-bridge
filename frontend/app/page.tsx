"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const fade = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.06 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
};

const steps = [
  {
    title: "Deposit privately",
    body: "Lock funds on Ethereum behind a Poseidon commitment. No destination address is ever recorded on chain.",
    tag: "Sepolia",
  },
  {
    title: "Prove, do not trust",
    body: "A relayer proves the vault state into QIE with a zero knowledge inclusion proof. QIE verifies math, not messengers.",
    tag: "SP1 zkVM",
  },
  {
    title: "Claim from anywhere",
    body: "From a fresh wallet, prove you know the secret and reveal only a nullifier. The sender to recipient link is severed.",
    tag: "QIE",
  },
];

export default function Home() {
  return (
    <div className="space-y-20">
      <section className="pt-8 text-center">
        <motion.div initial="hidden" animate="show" custom={0} variants={fade} className="flex justify-center">
          <span className="pill text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            Trustless. Private. Cross chain.
          </span>
        </motion.div>

        <motion.h1
          initial="hidden"
          animate="show"
          custom={1}
          variants={fade}
          className="mx-auto mt-6 max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl"
        >
          Move value to QIE <span className="gradient-text">without leaving a trace</span>.
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="show"
          custom={2}
          variants={fade}
          className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-slate-400"
        >
          Veil Bridge combines lock and mint vaults, a zero knowledge light client, and a shielded
          claim pool. Bridge from Ethereum to QIE so that no one can link who sent and who received.
        </motion.p>

        <motion.div
          initial="hidden"
          animate="show"
          custom={3}
          variants={fade}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <Link href="/deposit" className="btn-primary px-6 py-3 text-[15px]">
            Start a private deposit
          </Link>
          <Link href="/claim" className="btn-ghost px-6 py-3 text-[15px]">
            Claim a note
          </Link>
        </motion.div>
      </section>

      <section className="grid gap-5 sm:grid-cols-3">
        {steps.map((s, i) => (
          <motion.div
            key={s.title}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            custom={i}
            variants={fade}
            className="glass group p-6"
          >
            <div className="flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400/30 to-iris-500/30 text-sm font-semibold text-white">
                {i + 1}
              </span>
              <span className="pill text-slate-400">{s.tag}</span>
            </div>
            <h3 className="mt-4 text-lg font-medium text-white">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.body}</p>
          </motion.div>
        ))}
      </section>

      <section className="glass relative overflow-hidden p-8 sm:p-10">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-iris-500/20 blur-3xl" />
        <h2 className="text-2xl font-semibold tracking-tight text-white">How privacy is preserved</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <Detail
            k="Commitment, not address"
            v="Deposits register Poseidon(nullifier, secret). The chain never sees where funds are going."
          />
          <Detail
            k="Nullifier, not identity"
            v="Claims reveal only Poseidon(nullifier), preventing double spends while staying unlinkable."
          />
          <Detail
            k="ZK inclusion proof"
            v="QIE verifies an SP1 proof that the source vault root is real. The relayer cannot forge state."
          />
          <Detail
            k="Fresh wallet claims"
            v="Withdraw from a brand new account funded separately, breaking the on chain graph link."
          />
        </div>
      </section>
    </div>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div className="border-l border-white/10 pl-4">
      <div className="text-sm font-medium text-white">{k}</div>
      <div className="mt-1 text-sm leading-relaxed text-slate-400">{v}</div>
    </div>
  );
}
