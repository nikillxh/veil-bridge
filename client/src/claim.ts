import fs from "node:fs";
import { ethers } from "ethers";
import { parseNote } from "./note.js";
import { PoseidonMerkleTree } from "./merkleTree.js";
import { buildWitnessInput, generateProof } from "./proof.js";
import { POOL_ABI, VAULT_ABI } from "./abi.js";

const LEVELS = 20;

/// Claim on QIE from a FRESH wallet. Rebuilds the source-chain commitment tree
/// from Deposit events, produces a Groth16 membership proof for the note, and
/// submits it to the ShieldedPool. No link to the original depositor is
/// revealed beyond the (already public) nullifier hash.
///
/// Env: SOURCE_RPC_URL, QIE_RPC_URL, CLAIMER_PRIVATE_KEY, VAULT_ADDRESS,
///      POOL_ADDRESS, NOTE (or NOTE_FILE). Optional: RECIPIENT.
async function main() {
  const sourceRpc = required("SOURCE_RPC_URL");
  const qieRpc = required("QIE_RPC_URL");
  const pk = required("CLAIMER_PRIVATE_KEY");
  const vaultAddress = required("VAULT_ADDRESS");
  const poolAddress = required("POOL_ADDRESS");
  const noteStr = readNote();

  const note = await parseNote(noteStr);
  const commitment = note.commitment;

  // 1. Rebuild the tree from on-chain Deposit events (source chain).
  const sourceProvider = new ethers.JsonRpcProvider(sourceRpc);
  const vault = new ethers.Contract(vaultAddress, VAULT_ABI, sourceProvider);
  const fromBlock = Number(process.env.START_BLOCK ?? "0");
  const events = await vault.queryFilter(vault.filters.Deposit(), fromBlock, "latest");

  const leaves: { index: number; commitment: bigint }[] = events.map((e: any) => ({
    index: Number(e.args.leafIndex),
    commitment: BigInt(e.args.commitment),
  }));
  leaves.sort((a, b) => a.index - b.index);
  const orderedCommitments = leaves.map((l) => l.commitment);

  const myIndex = orderedCommitments.findIndex((c) => c === commitment);
  if (myIndex < 0) throw new Error("commitment not found in vault deposits");

  const tree = await PoseidonMerkleTree.create(LEVELS, orderedCommitments);
  const merkle = tree.proof(myIndex);

  // 2. Connect a fresh QIE wallet for the claim.
  const qieProvider = new ethers.JsonRpcProvider(qieRpc);
  const claimer = new ethers.Wallet(pk, qieProvider);
  const recipient = process.env.RECIPIENT ?? claimer.address;

  const params = {
    recipient: BigInt(recipient),
    relayer: 0n,
    fee: 0n,
    refund: 0n,
  };

  console.log("generating proof for leaf index", myIndex, "root", "0x" + tree.root.toString(16));
  const input = buildWitnessInput(note, merkle, params);
  const proof = await generateProof(input);

  // 3. Submit the shielded claim to QIE.
  const pool = new ethers.Contract(poolAddress, POOL_ABI, claimer);
  const nullifierHash = "0x" + note.nullifierHash.toString(16).padStart(64, "0");
  const root = "0x" + tree.root.toString(16).padStart(64, "0");

  const tx = await pool.withdraw(
    proof.pA,
    proof.pB,
    proof.pC,
    root,
    nullifierHash,
    recipient,
    ethers.ZeroAddress,
    0n,
    0n,
  );
  console.log("claim tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("claimed! block:", receipt?.blockNumber, "recipient:", recipient);
}

function readNote(): string {
  if (process.env.NOTE) return process.env.NOTE;
  if (process.env.NOTE_FILE) return fs.readFileSync(process.env.NOTE_FILE, "utf8");
  const arg = process.argv[2];
  if (arg && fs.existsSync(arg)) return fs.readFileSync(arg, "utf8");
  if (arg) return arg;
  throw new Error("provide note via NOTE env, NOTE_FILE env, or CLI arg");
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var ${name}`);
  return v;
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
