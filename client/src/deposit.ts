import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { createNote, serializeNote } from "./note.js";
import { ERC20_ABI, VAULT_ABI } from "./abi.js";

/// Deposit on the source chain (EVM, e.g. Sepolia). Locks the vault
/// denomination and registers a fresh commitment. Prints + persists the secret
/// note needed to claim later on QIE.
///
/// Env: SOURCE_RPC_URL, DEPOSITOR_PRIVATE_KEY, VAULT_ADDRESS
async function main() {
  const rpc = required("SOURCE_RPC_URL");
  const pk = required("DEPOSITOR_PRIVATE_KEY");
  const vaultAddress = required("VAULT_ADDRESS");

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(pk, provider);
  const vault = new ethers.Contract(vaultAddress, VAULT_ABI, wallet);

  const note = await createNote();
  const commitment = "0x" + note.commitment.toString(16).padStart(64, "0");

  const token: string = await vault.token();
  const denomination: bigint = await vault.denomination();
  const isNative = token === ethers.ZeroAddress;

  let decimals = 18;
  let symbol = isNative ? "native" : "tokens";
  let erc20: ethers.Contract | null = null;
  if (!isNative) {
    erc20 = new ethers.Contract(token, ERC20_ABI, wallet);
    decimals = Number(await erc20.decimals().catch(() => 18));
    symbol = await erc20.symbol().catch(() => "tokens");
  }

  console.log(`Depositing ${ethers.formatUnits(denomination, decimals)} ${symbol}`);
  console.log("commitment =", commitment);

  if (!isNative && erc20) {
    const approveTx = await erc20.approve(vaultAddress, denomination);
    console.log("approve tx:", approveTx.hash);
    await approveTx.wait();
  }

  const tx = await vault.deposit(commitment, { value: isNative ? denomination : 0n });
  console.log("deposit tx:", tx.hash);
  const receipt = await tx.wait();

  const serialized = serializeNote(note);
  const dir = path.resolve(process.cwd(), "notes");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${commitment.slice(2, 18)}.note`);
  fs.writeFileSync(file, serialized);

  console.log("\n=== SAVE THIS NOTE TO CLAIM (KEEP SECRET) ===");
  console.log(serialized);
  console.log("saved to:", file);
  console.log("block:", receipt?.blockNumber);
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
