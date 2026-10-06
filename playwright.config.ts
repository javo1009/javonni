import { defineConfig, devices } from "@playwright/test";

// E2E runs against a running app with the demo seed loaded:
//   npm run db:seed -- --demo && npm run build && npm start   (or npm run dev)
//   npm run test:e2e
// PW_CHROMIUM_PATH lets sandboxes use a pre-installed Chromium.
export default defineConfig({
  testDir: "e2e",
  // Tests share one seeded database and change it, so run them in order.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
