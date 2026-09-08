import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PLAYWRIGHT_PORT must be an integer between 1 and 65535");
}
const baseURL = `http://127.0.0.1:${port}`;
const credentials = { username: "browser-test-only", password: "browser-test-only-password" };

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    httpCredentials: credentials,
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node --import tsx tests/browser/server.ts",
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    env: {
      PLAYWRIGHT_PORT: String(port),
      BASIC_AUTH_USER: credentials.username,
      BASIC_AUTH_PASSWORD: credentials.password,
    },
  },
});
