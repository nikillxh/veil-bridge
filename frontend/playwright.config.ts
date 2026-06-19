import { defineConfig } from "@playwright/test";

/// E2E against a running deployment (live URL or local `next start`).
/// BASE_URL selects the target; defaults to the production domain.
export default defineConfig({
  testDir: "./e2e",
  timeout: 600_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "https://veilbridge.vercel.app",
    headless: true,
    actionTimeout: 60_000,
    trace: "retain-on-failure",
  },
});
