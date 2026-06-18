import { buildPoseidon } from "circomlibjs";
import { ethers } from "ethers";

/// BN254 scalar field prime. All notes/commitments live in this field.
export const FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/// Must match MerkleTreeWithHistory.ZERO_VALUE on-chain:
/// keccak256("qie-bridge") % FIELD_SIZE.
export const ZERO_VALUE =
  BigInt(ethers.solidityPackedKeccak256(["string"], ["qie-bridge"])) % FIELD_SIZE;

let poseidonInstance: any | undefined;

async function getPoseidon(): Promise<any> {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

/// Poseidon hash matching circomlib's `Poseidon(n)` gadget used in the circuit.
export async function poseidon(inputs: bigint[]): Promise<bigint> {
  const p = await getPoseidon();
  const out = p(inputs.map((x) => p.F.e(x.toString())));
  return BigInt(p.F.toObject(out));
}
