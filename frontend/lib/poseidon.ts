import { buildPoseidon } from "circomlibjs";
import { keccak256, stringToBytes } from "viem";

export const FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/// Matches MerkleTreeWithHistory.ZERO_VALUE = keccak256("qie-bridge") % p.
export const ZERO_VALUE = BigInt(keccak256(stringToBytes("qie-bridge"))) % FIELD_SIZE;

let poseidonInstance: any | undefined;

async function getPoseidon(): Promise<any> {
  if (!poseidonInstance) poseidonInstance = await buildPoseidon();
  return poseidonInstance;
}

export async function poseidon(inputs: bigint[]): Promise<bigint> {
  const p = await getPoseidon();
  const out = p(inputs.map((x) => p.F.e(x.toString())));
  return BigInt(p.F.toObject(out));
}

export function toBytes32(value: bigint): `0x${string}` {
  return ("0x" + value.toString(16).padStart(64, "0")) as `0x${string}`;
}
