import { test, expect, type Page } from "@playwright/test";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { createWalletBackend } from "./wallet";

function pk(name: string): Hex {
  const v = process.env[name];
  if (!v) throw new Error(`missing ${name}`);
  return (v.startsWith("0x") ? v : `0x${v}`) as Hex;
}

// Recipient for the gasless claim: a fresh QIE address with no link to the
// depositor. The server relayer pays the gas; this wallet just receives funds.
const RECIPIENT = privateKeyToAccount(pk("CLAIMER_PRIVATE_KEY")).address;

// Browser-side EIP-1193 shim. Proxies every request to the Node backend
// (window.__walletRequest) and emits chain/account change events on switch.
function injectScript() {
  const listeners: Record<string, Array<(p: unknown) => void>> = {};
  const emit = (event: string, payload: unknown) =>
    (listeners[event] || []).forEach((fn) => fn(payload));

  const provider: any = {
    isMetaMask: true,
    _testWallet: true,
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      const res = await (window as any).__walletRequest(method, params || []);
      if (method === "wallet_switchEthereumChain") {
        emit("chainChanged", await (window as any).__walletRequest("eth_chainId", []));
        emit("accountsChanged", await (window as any).__walletRequest("eth_accounts", []));
      }
      return res;
    },
    on: (e: string, fn: (p: unknown) => void) => {
      (listeners[e] ||= []).push(fn);
      return provider;
    },
    removeListener: (e: string, fn: (p: unknown) => void) => {
      listeners[e] = (listeners[e] || []).filter((f) => f !== fn);
      return provider;
    },
  };

  (window as any).ethereum = provider;
  const info = {
    uuid: "11111111-1111-1111-1111-111111111111",
    name: "Test Wallet",
    icon: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    rdns: "test.injected.wallet",
  };
  const announce = () =>
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }),
    );
  window.addEventListener("eip6963:requestProvider", announce as EventListener);
  announce();
  window.dispatchEvent(new Event("ethereum#initialized"));
}

async function setupWallet(page: Page) {
  const backend = createWalletBackend();
  await page.exposeFunction("__walletRequest", (method: string, params: unknown[]) =>
    backend(method, params),
  );
  await page.addInitScript(injectScript);
}

async function connect(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  const pill = page.getByRole("button", { name: /0x[0-9a-fA-F]{4}\.\.\./ });

  // The injected provider reports authorized accounts, so wagmi auto-connects on
  // load. Wait for that; only fall back to the manual modal flow if it does not.
  try {
    await expect(pill.first()).toBeVisible({ timeout: 20_000 });
    return;
  } catch {
    /* fall through to manual connect */
  }

  await expect(async () => {
    await page.getByRole("button", { name: /^Connect wallet$/i }).first().click({ timeout: 5_000 });
    await expect(page.getByText(/Connect a wallet/i)).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  await page.getByRole("button", { name: /Test Wallet|MetaMask|Injected/i }).first().click();
  await expect(pill.first()).toBeVisible({ timeout: 30_000 });
}

test("deposit then shielded claim through the UI", async ({ page }) => {
  await setupWallet(page);

  // --- Deposit on Sepolia ---
  await page.goto("/deposit");
  await connect(page);

  await expect(page.getByText(/Amount per note/i)).toBeVisible();
  await expect(page.getByText("Fixed denomination", { exact: true })).toBeVisible();

  // Default count is 1: deposit a single 0.1 USDC note.
  await page.getByRole("button", { name: /Generate note and deposit/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Funds are locked/i)).toBeVisible({ timeout: 240_000 });

  const note = (await page.locator("code", { hasText: "qie-note-v1:" }).first().textContent())?.trim();
  expect(note, "secret note should be shown").toBeTruthy();
  await dialog.getByRole("button", { name: /Download/i }).first().isVisible().catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});

  // --- Gasless claim on QIE (no network switch; relayer pays gas) ---
  await page.goto("/claim");
  const textarea = page.locator("textarea");
  await expect(textarea).toBeVisible({ timeout: 30_000 });
  await textarea.fill(note!);

  const recipientField = page.getByPlaceholder(/wrapped USDC is minted/i);
  await expect(recipientField).toBeVisible({ timeout: 10_000 });
  await recipientField.fill(RECIPIENT);

  await page.getByRole("button", { name: /Generate proof and claim/i }).click();

  await expect(page.getByRole("dialog").getByText(/Claim complete/i)).toBeVisible({
    timeout: 240_000,
  });
});
