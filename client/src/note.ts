import { randomBytes } from "node:crypto";
import { FIELD_SIZE, poseidon } from "./poseidon.js";

/// A shielded-deposit note. Keep this SECRET: anyone holding it can claim.
export interface Note {
  nullifier: bigint;
  secret: bigint;
  commitment: bigint;
  nullifierHash: bigint;
}

/// Uniformly-random field element (31 bytes < field prime, so no bias).
function randomFieldElement(): bigint {
  return BigInt("0x" + randomBytes(31).toString("hex")) % FIELD_SIZE;
}

export async function createNote(): Promise<Note> {
  const nullifier = randomFieldElement();
  const secret = randomFieldElement();
  const commitment = await poseidon([nullifier, secret]);
  const nullifierHash = await poseidon([nullifier]);
  return { nullifier, secret, commitment, nullifierHash };
}

const PREFIX = "qie-note-v1";

export function serializeNote(note: Note): string {
  return `${PREFIX}:${note.nullifier.toString(16)}:${note.secret.toString(16)}`;
}

export async function parseNote(serialized: string): Promise<Note> {
  const parts = serialized.trim().split(":");
  if (parts.length !== 3 || parts[0] !== PREFIX) {
    throw new Error("invalid note format");
  }
  const nullifier = BigInt("0x" + parts[1]);
  const secret = BigInt("0x" + parts[2]);
  const commitment = await poseidon([nullifier, secret]);
  const nullifierHash = await poseidon([nullifier]);
  return { nullifier, secret, commitment, nullifierHash };
}
