import type { Note } from "./note";
import type { MerkleProof } from "./merkleTree";

const WASM_URL = "/circuits/withdraw.wasm";
const ZKEY_URL = "/circuits/withdraw_final.zkey";

export interface SolidityProof {
  pA: [bigint, bigint];
  pB: [[bigint, bigint], [bigint, bigint]];
  pC: [bigint, bigint];
  pubSignals: bigint[];
}

export interface WithdrawPublicParams {
  recipient: bigint;
  relayer: bigint;
  fee: bigint;
  refund: bigint;
}

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

/// Generate the Groth16 proof in the browser. snarkjs streams the wasm + zkey
/// from /public/circuits over fetch.
export async function generateProof(input: object): Promise<SolidityProof> {
  const snarkjs = await import("snarkjs");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_URL, ZKEY_URL);
  const calldata: string = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const argv = calldata.replace(/[\["\]\s]/g, "").split(",").map((x) => BigInt(x));

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
