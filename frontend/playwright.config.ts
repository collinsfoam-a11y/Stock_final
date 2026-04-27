import { defineConfig, devices } from "@playwright/test";

import { AUTH_STATE_FILES, BACKEND_BASE_URL, FRONTEND_BASE_URL } from "./e2e/helpers/authConfig";

const webPort = Number(process.env.E2E_WEB_PORT || 8083);

const buildRoleProject = (
  name: string,
  device: keyof typeof devices,
  storageState: string,
  testMatch: RegExp,
) => ({
  name,
  testMatch,
  dependencies: ["setup"],
  use: {
    ...devices[device],
    storageState,
  },
});

export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { open: "never" }],
    ["list"],
    ...(process.env.CI ? [["github"] as const] : []),
  ],
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: FRONTEND_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /tests\/auth\.setup\.ts/,
    },
    {
      name: "public-desktop",
      testMatch: /e2e\/(auth|auth-guard|visual)\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    buildRoleProject(
      "staff-desktop",
      "Desktop Chrome",
      AUTH_STATE_FILES.staff,
      /e2e\/(business-correctness|core-flow|misplaced-item)\.spec\.ts/,
    ),
    buildRoleProject(
      "supervisor-desktop",
      "Desktop Chrome",
      AUTH_STATE_FILES.supervisor,
      /e2e\/(supervisor-smoke|watchtower-regression|recount-assignment-ui)\.spec\.ts/,
    ),
    buildRoleProject(
      "admin-desktop",
      "Desktop Chrome",
      AUTH_STATE_FILES.admin,
      /e2e\/admin-dashboard\.spec\.ts/,
    ),
    buildRoleProject(
      "supervisor-mobile",
      "Pixel 7",
      AUTH_STATE_FILES.supervisor,
      /e2e\/recount-assignment-ui\.spec\.ts/,
    ),
  ],
  webServer: {
    command: `npx expo start --web --port ${webPort}`,
    url: FRONTEND_BASE_URL,
    reuseExistingServer: process.env.E2E_REUSE_EXISTING_SERVER === "true",
    timeout: 120 * 1000,
    env: {
      BROWSER: "none",
      EXPO_PUBLIC_E2E: "true",
      EXPO_PUBLIC_BACKEND_URL: BACKEND_BASE_URL,
      EXPO_PUBLIC_BACKEND_PORT: "8001",
    },
  },
});
