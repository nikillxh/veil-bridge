import { FIELD_SIZE, poseidon } from "./poseidon";

export interface Note {
  nullifier: bigint;
  secret: bigint;
  commitment: bigint;
  nullifierHash: bigint;
}

const PREFIX = "qie-note-v1";

function randomFieldElement(): bigint {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return BigInt(hex) % FIELD_SIZE;
}

export async function createNote(): Promise<Note> {
  const nullifier = randomFieldElement();
  const secret = randomFieldElement();
  const commitment = await poseidon([nullifier, secret]);
  const nullifierHash = await poseidon([nullifier]);
  return { nullifier, secret, commitment, nullifierHash };
}

export function serializeNote(note: Note): string {
  return `${PREFIX}:${note.nullifier.toString(16)}:${note.secret.toString(16)}`;
}

export async function parseNote(serialized: string): Promise<Note> {
  const parts = serialized.trim().split(":");
  if (parts.length !== 3 || parts[0] !== PREFIX) {
    throw new Error("Invalid note format. Expected qie-note-v1:<nullifier>:<secret>.");
  }
  if (!/^[0-9a-fA-F]+$/.test(parts[1]) || !/^[0-9a-fA-F]+$/.test(parts[2])) {
    throw new Error("Invalid note: nullifier and secret must be hex.");
  }
  const nullifier = BigInt("0x" + parts[1]);
  const secret = BigInt("0x" + parts[2]);
  if (nullifier >= FIELD_SIZE || secret >= FIELD_SIZE) {
    throw new Error("Invalid note: value out of field.");
  }
  const commitment = await poseidon([nullifier, secret]);
  const nullifierHash = await poseidon([nullifier]);
  return { nullifier, secret, commitment, nullifierHash };
}
