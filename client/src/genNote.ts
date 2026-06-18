import { createNote, serializeNote } from "./note.js";

/// Generate a fresh note off-chain and print it (no transactions). Used by the
/// local end-to-end run so the deposit can be submitted with `cast`.
async function main() {
  const note = await createNote();
  console.log("NOTE=" + serializeNote(note));
  console.log("COMMITMENT=0x" + note.commitment.toString(16).padStart(64, "0"));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
