import { fileURLToPath } from "node:url";
import path from "node:path";
import * as snarkjs from "snarkjs";
import type { Note } from "./note.js";
import type { MerkleProof } from "./merkleTree.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.resolve(__dirname, "../../circuits/build");
export const WASM_PATH = path.join(BUILD, "withdraw_js/withdraw.wasm");
export const ZKEY_PATH = path.join(BUILD, "withdraw_final.zkey");

export interface WithdrawPublicParams {
  recipient: bigint;
  relayer: bigint;
  fee: bigint;
  refund: bigint;
}

/// Solidity calldata for `WithdrawVerifier.verifyProof` + `ShieldedPool.withdraw`.
export interface SolidityProof {
  pA: [string, string];
  pB: [[string, string], [string, string]];
  pC: [string, string];
  pubSignals: string[]; // [root, nullifierHash, recipient, relayer, fee, refund]
}

/// Build the full circuit witness input from a note, its Merkle path, and the
/// public claim parameters.
export function buildWitnessInput(
  note: Note,
  merkle: MerkleProof,
  params: WithdrawPublicParams,
) {
  return {
    root: merkle.root.toString(),
    nullifierHash: note.nullifierHash.toString(),
    recipient: params.recipient.toString(),
    relayer: params.relayer.toString(),
    fee: params.fee.toString(),
    refund: params.refund.toString(),
    nullifier: note.nullifier.toString(),
    secret: note.secret.toString(),
    pathElements: merkle.pathElements.map((x) => x.toString()),
    pathIndices: merkle.pathIndices.map((x) => x.toString()),
  };
}

export async function generateProof(input: object): Promise<SolidityProof> {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    WASM_PATH,
    ZKEY_PATH,
  );

  const calldata: string = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const argv = calldata.replace(/[\["\]\s]/g, "").split(",");

  return {
    pA: [argv[0], argv[1]],
    pB: [
      [argv[2], argv[3]],
      [argv[4], argv[5]],
    ],
    pC: [argv[6], argv[7]],
    pubSignals: argv.slice(8),
  };
}
