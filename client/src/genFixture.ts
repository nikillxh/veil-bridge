import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { createNote, serializeNote } from "./note.js";
import { PoseidonMerkleTree } from "./merkleTree.js";
import { buildWitnessInput, generateProof, type WithdrawPublicParams } from "./proof.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../../contracts-qie/test/fixtures/withdraw_fixture.json");

const LEVELS = 20;

/// Generates a real Groth16 proof for a single-deposit tree and writes a
/// fixture consumed by the Foundry end-to-end test. This proves the exported
/// on-chain verifier accepts proofs produced by the real circuit + client.
async function main() {
  const note = await createNote();

  // Single-leaf tree; mirrors a vault with exactly one deposit.
  const tree = await PoseidonMerkleTree.create(LEVELS, [note.commitment]);
  const merkle = tree.proof(0);

  const params: WithdrawPublicParams = {
    recipient: BigInt("0x1111111111111111111111111111111111111111"),
    relayer: 0n,
    fee: 0n,
    refund: 0n,
  };

  const input = buildWitnessInput(note, merkle, params);
  const proof = await generateProof(input);

  const fixture = {
    note: serializeNote(note),
    root: "0x" + tree.root.toString(16).padStart(64, "0"),
    nullifierHash: "0x" + note.nullifierHash.toString(16).padStart(64, "0"),
    recipient: "0x1111111111111111111111111111111111111111",
    relayer: "0x0000000000000000000000000000000000000000",
    fee: params.fee.toString(),
    refund: params.refund.toString(),
    pA: proof.pA,
    pB: proof.pB,
    pC: proof.pC,
    pubSignals: proof.pubSignals,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(fixture, null, 2));
  console.log("Wrote fixture ->", OUT);
  console.log("root =", fixture.root);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
