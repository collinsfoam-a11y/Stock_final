import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { getAuthenticatedSession, seedAuthState } from "./helpers/auth";

/**
 * Visual Regression Tests
 *
 * Creates baseline screenshots for critical screens.
 * Run with: npx playwright test visual.spec.ts --update-snapshots
 *
 * These tests compare current UI against stored baselines to detect
 * unintended visual changes.
 */

test.skip(!process.env.RUN_VISUAL, "Visual baselines are not enabled for this run.");
test.describe.configure({ mode: "serial" });

async function seedRoleSession(
  page: any,
  request: any,
  role: "staff" | "supervisor" | "admin",
  targetPath: string
) {
  const session = await getAuthenticatedSession(request, role);
  await seedAuthState(page, {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    user: session.user,
  });
  await page.goto(targetPath);
}

function skipIfMissingBaseline(testInfo: any, name: string) {
  const isUpdatingSnapshots =
    testInfo?.config?.updateSnapshots && testInfo.config.updateSnapshots !== "none";
  if (isUpdatingSnapshots) {
    return;
  }

  const expected = testInfo.snapshotPath(name);
  if (!fs.existsSync(expected)) {
    test.skip(true, `Missing snapshot baseline: ${name}`);
  }
}

async function waitForStableUi(page: any) {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("#root")).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(700);
}

test.describe("Visual Regression - Login", () => {
  test("login page matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "login-page.png");
    await page.goto("/");

    await waitForStableUi(page);

    // Hide dynamic elements like timestamps
    await page.addStyleTag({
      content: `
        [data-testid="timestamp"],
        [data-testid="version"] {
          visibility: hidden !important;
        }
      `,
    });

    // Take full page screenshot
    await expect(page).toHaveScreenshot("login-page.png", {
      fullPage: true,
      animations: "disabled",
      threshold: 0.1, // Allow 10% pixel difference
    });
  });
});

test.describe("Visual Regression - Staff", () => {
  test.beforeEach(async ({ page, request }) => {
    await seedRoleSession(page, request, "staff", "/staff/home");
    await waitForStableUi(page);
  });

  test("staff home page matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "staff-home.png");
    await waitForStableUi(page);
    await page.waitForURL(/\/staff\/home(?:\?.*)?$/, { timeout: 20000 });
    await expect(page.getByText(/start new session/i)).toBeVisible({
      timeout: 15000,
    });

    await expect(page).toHaveScreenshot("staff-home.png", {
      fullPage: false,
      animations: "disabled",
      threshold: 0.15,
      maxDiffPixelRatio: 0.08,
    });
  });

  test("scan screen matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "scan-screen.png");
    await page.goto("/staff/scan");
    await page.waitForURL(/\/staff\/scan(?:\?.*)?$/, { timeout: 20000 });
    await waitForStableUi(page);
    await expect(page.getByText(/session link is incomplete/i)).toBeVisible({
      timeout: 15000,
    });

    await expect(page).toHaveScreenshot("scan-screen.png", {
      fullPage: false,
      animations: "disabled",
      threshold: 0.2, // Higher threshold for camera area
      maxDiffPixelRatio: 0.05,
    });
  });
});

test.describe("Visual Regression - Supervisor", () => {
  test.beforeEach(async ({ page, request }) => {
    await seedRoleSession(page, request, "supervisor", "/supervisor/dashboard");
    await waitForStableUi(page);
  });

  test("supervisor dashboard matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "supervisor-dashboard.png");
    await waitForStableUi(page);

    // Hide live metrics that change
    await page.addStyleTag({
      content: `
        [data-testid="live-indicator"],
        [data-testid="metric-value"],
        [data-testid="activity-feed"] {
          visibility: hidden !important;
        }
      `,
    });

    await expect(page).toHaveScreenshot("supervisor-dashboard.png", {
      fullPage: true,
      animations: "disabled",
      threshold: 0.15,
    });
  });
});

test.describe("Visual Regression - Admin", () => {
  test.beforeEach(async ({ page, request }) => {
    await seedRoleSession(page, request, "admin", "/admin/dashboard-web");
    await waitForStableUi(page);
  });

  test("admin dashboard matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "admin-dashboard.png");
    await waitForStableUi(page);

    // Hide dynamic elements
    await page.addStyleTag({
      content: `
        [data-testid="timestamp"],
        [data-testid="uptime"],
        [data-testid="memory-usage"] {
          visibility: hidden !important;
        }
      `,
    });

    await expect(page).toHaveScreenshot("admin-dashboard.png", {
      fullPage: true,
      animations: "disabled",
      threshold: 0.15,
      maxDiffPixels: 200,
    });
  });

  test("admin users page matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "admin-users.png");
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/users(?:\?.*)?$/, { timeout: 20000 });
    await waitForStableUi(page);

    await expect(page).toHaveScreenshot("admin-users.png", {
      fullPage: true,
      animations: "disabled",
      threshold: 0.15,
      maxDiffPixels: 300,
    });
  });

  test("admin settings page matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "admin-settings.png");
    // Navigate to settings
    await page
      .getByText(/settings/i)
      .first()
      .click();
    await waitForStableUi(page);

    await expect(page).toHaveScreenshot("admin-settings.png", {
      fullPage: true,
      animations: "disabled",
      threshold: 0.15,
      maxDiffPixels: 300,
    });
  });
});

test.describe("Visual Regression - Components", () => {
  test("modal overlay matches baseline", async ({ page, request }, testInfo) => {
    skipIfMissingBaseline(testInfo, "modal-user-form.png");
    await seedRoleSession(page, request, "admin", "/admin/dashboard-web");
    await waitForStableUi(page);

    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/users(?:\?.*)?$/, { timeout: 20000 });
    await waitForStableUi(page);

    // Open add user modal
    const addButton = page.getByTestId("users-add-button");
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();
    await page.waitForTimeout(500); // Wait for animation

    await expect(page).toHaveScreenshot("modal-user-form.png", {
      fullPage: true,
      animations: "disabled",
      threshold: 0.15,
    });
  });
});

test.describe("Visual Regression - Dark Mode", () => {
  test.use({ colorScheme: "dark" });

  test("login page dark mode matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "login-page-dark.png");
    await page.goto("/");
    await waitForStableUi(page);

    await expect(page).toHaveScreenshot("login-page-dark.png", {
      fullPage: false,
      animations: "disabled",
      threshold: 0.1,
      maxDiffPixelRatio: 0.06,
    });
  });
});

test.describe("Visual Regression - Mobile", () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

  test("login page mobile matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "login-page-mobile.png");
    await page.goto("/");
    await waitForStableUi(page);

    await expect(page).toHaveScreenshot("login-page-mobile.png", {
      fullPage: false,
      animations: "disabled",
      threshold: 0.1,
      maxDiffPixelRatio: 0.12,
    });
  });
});
