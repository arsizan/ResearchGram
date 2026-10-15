import { defineConfig } from "@playwright/test";

/*
 * Browser tests against a production build of the app, with Supabase faked
 * (tests/e2e/fake-supabase.mjs). Run: npm run test:e2e
 * In CI the browser comes from `npx playwright install chromium`; elsewhere
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE can point at an installed Chromium.
 */
const PORT = Number(process.env.E2E_PORT || 3100);

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.mjs$/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      // A fake microphone for the voice message test.
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: "node tests/e2e/auth-server.mjs",
      url: "http://127.0.0.1:54321/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node tests/e2e/serve.mjs",
      url: `http://127.0.0.1:${PORT}/`,
      timeout: 600_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
