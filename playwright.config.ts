import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:5000",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "node tests/fixtures/auth-backend.mjs",
      url: "http://localhost:4100/test/stats",
      reuseExistingServer: true,
    },
    {
      command:
        "env AUTH_SERVICE_URL=http://127.0.0.1:4100 CHAT_SERVICE_URL=http://127.0.0.1:4101 NEXT_PUBLIC_SOCKET_URL=http://127.0.0.1:4101 pnpm dev",
      url: "http://localhost:5000",
      reuseExistingServer: true,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        channel: "chrome",
      },
    },
  ],
});
