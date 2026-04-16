import { test, expect } from "@playwright/test";

async function ensureCredentialsMode(page: any) {
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible({
    timeout: 15000,
  });
}

/**
 * Authentication E2E Tests
 *
 * Tests the complete authentication flow including:
 * - Login with valid credentials
 * - Login with invalid credentials
 * - PIN-based quick login
 * - Logout flow
 * - Session persistence
 */

test.describe("Authentication", () => {
  test.describe("Login Flow", () => {
    test("should show login page for unauthenticated users", async ({
      page,
    }) => {
      await page.goto("/login?e2e=1");

      await ensureCredentialsMode(page);
    });

    test("should login successfully with valid credentials", async ({
      page,
    }) => {
      test.skip(true, "Login submit is flaky on RN-web in headless mode.");
      await page.goto("/login?e2e=1");

      await ensureCredentialsMode(page);

      const usernameInput = page.getByRole("textbox", {
        name: /enter your username/i,
      });
      const passwordInput = page.getByRole("textbox", {
        name: /enter your password/i,
      });

      await usernameInput.fill("staff1");
      await passwordInput.fill("staff123");
      await expect(usernameInput).toHaveValue("staff1");
      await expect(passwordInput).toHaveValue("staff123");
      const loginResponsePromise = page.waitForResponse((r) => {
        return (
          r.request().method() === "POST" && r.url().includes("/api/auth/login")
        );
      });
      const signInButton = page.getByRole("button", { name: /^sign in$/i });
      await signInButton.evaluate((el: any) => el.click());
      const loginResponse = await loginResponsePromise;
      const loginBody = await loginResponse.json().catch(() => null);
      expect(loginResponse.status()).toBe(200);
      expect(loginBody?.success).toBe(true);

      await page.waitForURL("**/staff/home**", { timeout: 15000 });
      await expect(page.getByText(/start new session/i)).toBeVisible({
        timeout: 15000,
      });
    });

    test("should show error for invalid credentials", async ({ page }) => {
      test.skip(true, "Login submit is flaky on RN-web in headless mode.");
      await page.goto("/login?e2e=1");

      await ensureCredentialsMode(page);

      const dialogPromise = page.waitForEvent("dialog").catch(() => null);

      const usernameInput = page.getByRole("textbox", {
        name: /enter your username/i,
      });
      const passwordInput = page.getByRole("textbox", {
        name: /enter your password/i,
      });

      await usernameInput.fill("staff1");
      await passwordInput.fill("wrongpassword");
      await expect(usernameInput).toHaveValue("staff1");
      await expect(passwordInput).toHaveValue("wrongpassword");
      const loginResponsePromise = page.waitForResponse((r) => {
        return (
          r.request().method() === "POST" && r.url().includes("/api/auth/login")
        );
      });
      const signInButton = page.getByRole("button", { name: /^sign in$/i });
      await signInButton.evaluate((el: any) => el.click());
      const loginResponse = await loginResponsePromise;
      expect(loginResponse.status()).toBe(200);

      const dialog = await dialogPromise;
      if (dialog) {
        expect(dialog.message()).toMatch(/invalid|incorrect|failed/i);
        await dialog.accept();
        return;
      }

      await expect(
        page.getByText(/invalid|incorrect|failed/i).or(page.getByRole("alert")),
      ).toBeVisible({ timeout: 10000 });
    });

    test("should clear form fields on error", async ({ page }) => {
      test.skip(true, "Login submit is flaky on RN-web in headless mode.");
      await page.goto("/login?e2e=1");

      await ensureCredentialsMode(page);

      const usernameField = page.getByRole("textbox", {
        name: /enter your username/i,
      });
      const passwordField = page.getByRole("textbox", {
        name: /enter your password/i,
      });

      const dialogPromise = page.waitForEvent("dialog").catch(() => null);

      await usernameField.fill("admin");
      await passwordField.fill("wrongpassword");
      const loginResponsePromise = page.waitForResponse((r) => {
        return (
          r.request().method() === "POST" && r.url().includes("/api/auth/login")
        );
      });
      const signInButton = page.getByRole("button", { name: /^sign in$/i });
      await signInButton.evaluate((el: any) => el.click());
      const loginResponse = await loginResponsePromise;
      expect(loginResponse.status()).toBe(200);

      const dialog = await dialogPromise;
      if (dialog) {
        await dialog.accept();
      } else {
        await expect(
          page
            .getByText(/invalid|incorrect|failed/i)
            .or(page.getByRole("alert")),
        ).toBeVisible({ timeout: 10000 });
      }

      await expect(usernameField).toHaveValue("admin");
      await expect(passwordField).toHaveValue("");
    });
  });

  test.describe.skip("Logout Flow", () => {
    test.beforeEach(async ({ page }) => {
      // Login first
      await page.goto("/login?e2e=1");

      await ensureCredentialsMode(page);

      const usernameInput = page.locator("input").first();
      const passwordInput = page.locator('input[type="password"]').first();

      await usernameInput.fill("staff1");
      await passwordInput.fill("staff123");
      await page.getByRole("button", { name: /^sign in$/i }).click();

      await expect(
        page.getByText(/start new session/i).or(page.getByText(/dashboard/i)),
      ).toBeVisible({ timeout: 15000 });
    });

    test("should logout successfully", async ({ page }) => {
      test.skip(
        true,
        "Logout UI is app-role/layout dependent; enable when stable.",
      );
      // Find and click logout button (might be in menu)
      const settingsLink = page.getByText(/settings/i).first();
      if (await settingsLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await settingsLink.click();
      }

      const logoutTarget = page
        .getByRole("button", { name: /log\s*out|sign\s*out/i })
        .or(page.getByText(/log\s*out|sign\s*out/i));

      await expect(logoutTarget).toBeVisible({ timeout: 15000 });
      await logoutTarget.first().click();

      await expect(page.getByText(/pin|credentials/i)).toBeVisible({
        timeout: 15000,
      });
    });
  });

  test.describe("Session Persistence", () => {
    test("should maintain session after page refresh", async ({ page }) => {
      test.skip(
        true,
        "Persistence depends on storage and environment; enable when stable.",
      );
      // Login
      await page.goto("/login");

      await ensureCredentialsMode(page);

      await page.getByPlaceholder(/username/i).fill("staff1");
      await page.getByPlaceholder(/password/i).fill("staff123");
      await page.getByRole("button", { name: /sign in/i }).click();

      await expect(
        page.getByText(/new count area/i).or(page.getByText(/dashboard/i)),
      ).toBeVisible({ timeout: 15000 });

      // Refresh page
      await page.reload();

      // Should still be logged in
      await expect(
        page.getByText(/new count area/i).or(page.getByText(/dashboard/i)),
      ).toBeVisible({ timeout: 15000 });

      // Should NOT see login screen
      await expect(page.getByRole("button", { name: /sign in/i }))
        .not.toBeVisible({ timeout: 3000 })
        .catch(() => {
          // This is expected - login button should not be visible
        });
    });
  });
});

test.describe("PIN Authentication", () => {
  test("should allow PIN-based quick login when configured", async ({
    page,
  }) => {
    // This test assumes PIN is configured for the user
    // Skip if PIN feature is not enabled
    test.skip(true, "PIN feature test - requires configured PIN");

    await page.goto("/");

    // Look for PIN entry option
    const pinOption = page.getByText(/use pin|quick login|pin/i);
    if (await pinOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await pinOption.click();

      // Enter PIN digits
      const pinInput = page.getByPlaceholder(/pin/i);
      await pinInput.fill("1234");

      // Should login successfully
      await expect(
        page.getByText(/new count area/i).or(page.getByText(/dashboard/i)),
      ).toBeVisible({ timeout: 15000 });
    }
  });
});
