import { defineConfig, devices } from "@playwright/test";

const webPort = Number(process.env.E2E_WEB_PORT || 8083);
const webBaseUrl =
  process.env.E2E_BASE_URL || `http://localhost:${webPort}`;
const backendBaseUrl =
  process.env.E2E_BACKEND_URL || "http://localhost:8001";

/**
 * Playwright E2E Test Configuration for Stock Verification App
 *
 * Run all tests: npx playwright test
 * Run specific tests: npx playwright test e2e/auth.spec.ts
 * Run with UI: npx playwright test --ui
 * Debug mode: npx playwright test --debug
 *
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ["html", { open: "never" }],
    ["list"],
    ...(process.env.CI ? [["github"] as const] : []),
  ],
  /* Test timeout */
  timeout: 60000,
  /* Expect settings */
  expect: {
    timeout: 10000,
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: webBaseUrl,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    /* Take screenshot on failure */
    screenshot: "only-on-failure",

    /* Record video on retry */
    video: "on-first-retry",

    /* Action timeout */
    actionTimeout: 10000,

    /* Navigation timeout */
    navigationTimeout: 30000,
  },

  /* Configure projects for major browsers */
  projects: [
    // Mobile web testing (primary)
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 14"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 7"] },
    },
    // Desktop testing
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    // Tablet testing
    {
      name: "iPad",
      use: { ...devices["iPad Pro 11"] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: `npx expo start --web --port ${webPort}`,
    url: webBaseUrl,
    reuseExistingServer:
      process.env.E2E_REUSE_EXISTING_SERVER === "true" || !process.env.CI,
    timeout: 120 * 1000, // 2 minutes to start
    env: {
      BROWSER: "none", // Don't auto-open browser
      EXPO_PUBLIC_E2E: "true",
      EXPO_PUBLIC_BACKEND_URL: backendBaseUrl,
      EXPO_PUBLIC_BACKEND_PORT: "8001",
    },
  },
});
