import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// The same .env files the dev server reads, so a test knows whether
// OPENAI_API_KEY is set (API flows are skipped without it). Only its presence
// is ever checked; the value is never printed.
loadEnvConfig(process.cwd());

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  // Every test opens its own browser context, but API flows each mint a
  // realtime session; run them one at a time so they don't compete.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
