import { defineConfig, devices } from "@playwright/test";

const command = process.platform === "win32" ? "npm.cmd run dev" : "npm run dev";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command,
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env, MOCK_AI: "true", PORT: "4000", CLIENT_ORIGIN: "http://localhost:5173" },
  },
});
