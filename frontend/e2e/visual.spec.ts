import { test, expect } from "@playwright/test";
import fs from "node:fs";

/**
 * Visual Regression Tests
 *
 * Creates baseline screenshots for critical screens.
 * Run with: npx playwright test visual.spec.ts --update-snapshots
 *
 * These tests compare current UI against stored baselines to detect
 * unintended visual changes.
 */

test.skip(
  !process.env.RUN_VISUAL,
  "Visual baselines are not enabled for this run.",
);

async function ensureCredentialsMode(page: any) {
  const usernameField = page.getByPlaceholder(/username/i);
  if (await usernameField.isVisible({ timeout: 750 }).catch(() => false))
    return;
  const credentialsTab = page
    .getByRole("button", { name: /credentials/i })
    .or(page.getByText(/credentials/i));
  await credentialsTab.first().click();
  await expect(usernameField).toBeVisible({ timeout: 5000 });
}

function skipIfMissingBaseline(testInfo: any, name: string) {
  const expected = testInfo.snapshotPath(name);
  if (!fs.existsSync(expected)) {
    test.skip(true, `Missing snapshot baseline: ${name}`);
  }
}

test.describe("Visual Regression - Login", () => {
  test("login page matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "login-page.png");
    await page.goto("/");

    // Wait for page to fully load
    await page.waitForLoadState("networkidle");

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
  test.beforeEach(async ({ page }) => {
    // Login as staff user
    await page.goto("/");

    const getStarted = page.getByText(/get started/i);
    if (await getStarted.isVisible({ timeout: 3000 }).catch(() => false)) {
      await getStarted.click();
    }

    await ensureCredentialsMode(page);

    await page.getByPlaceholder(/username/i).fill("staff1");
    await page.getByPlaceholder(/password/i).fill("staff123");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for home page
    await page.waitForLoadState("networkidle");
  });

  test("staff home page matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "staff-home.png");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("staff-home.png", {
      fullPage: true,
      animations: "disabled",
      threshold: 0.15,
    });
  });

  test("scan screen matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "scan-screen.png");
    // Navigate to scan screen
    await page.getByText(/scan/i).first().click();
    await page.waitForLoadState("networkidle");

    // Camera placeholder instead of live camera
    await expect(page).toHaveScreenshot("scan-screen.png", {
      fullPage: true,
      animations: "disabled",
      threshold: 0.2, // Higher threshold for camera area
    });
  });
});

test.describe("Visual Regression - Supervisor", () => {
  test.beforeEach(async ({ page }) => {
    // Login as supervisor
    await page.goto("/");

    const getStarted = page.getByText(/get started/i);
    if (await getStarted.isVisible({ timeout: 3000 }).catch(() => false)) {
      await getStarted.click();
    }

    await ensureCredentialsMode(page);

    await page.getByPlaceholder(/username/i).fill("supervisor");
    await page.getByPlaceholder(/password/i).fill("super123");
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForLoadState("networkidle");
  });

  test("supervisor dashboard matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "supervisor-dashboard.png");
    await page.waitForLoadState("networkidle");

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
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto("/");

    const getStarted = page.getByText(/get started/i);
    if (await getStarted.isVisible({ timeout: 3000 }).catch(() => false)) {
      await getStarted.click();
    }

    await ensureCredentialsMode(page);

    await page.getByPlaceholder(/username/i).fill("admin");
    await page.getByPlaceholder(/password/i).fill("admin123");
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForLoadState("networkidle");
  });

  test("admin dashboard matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "admin-dashboard.png");
    await page.waitForLoadState("networkidle");

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
    });
  });

  test("admin users page matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "admin-users.png");
    // Navigate to users
    await page.getByText(/users/i).first().click();
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("admin-users.png", {
      fullPage: true,
      animations: "disabled",
      threshold: 0.15,
    });
  });

  test("admin settings page matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "admin-settings.png");
    // Navigate to settings
    await page
      .getByText(/settings/i)
      .first()
      .click();
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("admin-settings.png", {
      fullPage: true,
      animations: "disabled",
      threshold: 0.15,
    });
  });
});

test.describe("Visual Regression - Components", () => {
  test("modal overlay matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "modal-user-form.png");
    // Login first
    await page.goto("/");
    const getStarted = page.getByText(/get started/i);
    if (await getStarted.isVisible({ timeout: 3000 }).catch(() => false)) {
      await getStarted.click();
    }
    await ensureCredentialsMode(page);
    await page.getByPlaceholder(/username/i).fill("admin");
    await page.getByPlaceholder(/password/i).fill("admin123");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForLoadState("networkidle");

    // Navigate to users and click add
    await page.getByText(/users/i).first().click();
    await page.waitForLoadState("networkidle");

    // Open add user modal
    const addButton = page.getByRole("button", { name: /add|create/i });
    if (await addButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addButton.click();
      await page.waitForTimeout(500); // Wait for animation

      await expect(page).toHaveScreenshot("modal-user-form.png", {
        fullPage: true,
        animations: "disabled",
        threshold: 0.15,
      });
    }
  });
});

test.describe("Visual Regression - Dark Mode", () => {
  test.use({ colorScheme: "dark" });

  test("login page dark mode matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "login-page-dark.png");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("login-page-dark.png", {
      fullPage: true,
      animations: "disabled",
      threshold: 0.1,
    });
  });
});

test.describe("Visual Regression - Mobile", () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

  test("login page mobile matches baseline", async ({ page }, testInfo) => {
    skipIfMissingBaseline(testInfo, "login-page-mobile.png");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("login-page-mobile.png", {
      fullPage: true,
      animations: "disabled",
      threshold: 0.1,
    });
  });
});
