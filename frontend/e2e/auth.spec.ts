import { test, expect } from "@playwright/test";

import { assertAuthenticated, getRoleCredentials } from "./helpers/auth";
import { ensureCredentialsMode, gotoLogin } from "./helpers/loginPage";

test.describe("Authentication", () => {
  test.describe("Login Flow", () => {
    test("shows the login page for unauthenticated users", async ({
      page,
    }) => {
      await gotoLogin(page);

      await expect(page.getByTestId("login-submit")).toBeVisible();
    });

    test("logs in successfully with valid credentials", async ({
      page,
    }) => {
      const credentials = getRoleCredentials("staff");

      await gotoLogin(page);
      await page.getByTestId("login-username").fill(credentials.username);
      await page.getByTestId("login-password").fill(credentials.password);
      await expect(page.getByTestId("login-username")).toHaveValue(
        credentials.username,
      );
      await expect(page.getByTestId("login-password")).toHaveValue(
        credentials.password,
      );

      const loginResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/api/auth/login"),
      );

      await page.getByTestId("login-submit").click();

      const loginResponse = await loginResponsePromise;
      const loginBody = await loginResponse.json().catch(() => null);
      expect(loginResponse.status()).toBe(200);
      expect(loginBody?.success).toBe(true);

      await page.waitForURL("**/staff/home**", { timeout: 15000 });
      await expect(page.getByText(/start new session/i)).toBeVisible({
        timeout: 15000,
      });
    });

    test("shows an error for invalid credentials", async ({ page }) => {
      const credentials = getRoleCredentials("staff");

      await gotoLogin(page);

      const dialogPromise = page.waitForEvent("dialog").catch(() => null);

      await page.getByTestId("login-username").fill(credentials.username);
      await page.getByTestId("login-password").fill("wrongpassword");

      const loginResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/api/auth/login"),
      );

      await page.getByTestId("login-submit").click();

      const loginResponse = await loginResponsePromise;
      expect(loginResponse.status()).toBe(401);

      const dialog = await dialogPromise;
      if (dialog) {
        expect(dialog.message()).toMatch(/invalid|incorrect|failed/i);
        await dialog.accept();
        return;
      }

      await expect(
        page.getByText("Incorrect Sign-In Details", { exact: true }),
      ).toBeVisible({ timeout: 10000 });
      await expect(
        page.getByText("Incorrect username or password", { exact: true }),
      ).toBeVisible({ timeout: 10000 });
    });

    test("clears the password field after a failed login", async ({ page }) => {
      const credentials = getRoleCredentials("admin");

      await gotoLogin(page);

      const dialogPromise = page.waitForEvent("dialog").catch(() => null);

      await page.getByTestId("login-username").fill(credentials.username);
      await page.getByTestId("login-password").fill("wrongpassword");

      const loginResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/api/auth/login"),
      );

      await page.getByTestId("login-submit").click();

      const loginResponse = await loginResponsePromise;
      expect(loginResponse.status()).toBe(401);

      const dialog = await dialogPromise;
      if (dialog) {
        await dialog.accept();
      } else {
        await expect(
          page.getByText("Incorrect Sign-In Details", { exact: true }),
        ).toBeVisible({ timeout: 10000 });
        await expect(
          page.getByText("Incorrect username or password", { exact: true }),
        ).toBeVisible({ timeout: 10000 });
      }

      await expect(page.getByTestId("login-username")).toHaveValue(
        credentials.username,
      );
      await expect(page.getByTestId("login-password")).toHaveValue("");
    });
  });

  test.describe.skip("Logout Flow", () => {
    test.beforeEach(async ({ page }) => {
      const credentials = getRoleCredentials("staff");

      await gotoLogin(page);
      await page.getByTestId("login-username").fill(credentials.username);
      await page.getByTestId("login-password").fill(credentials.password);
      await page.getByTestId("login-submit").click();

      await expect(
        page.getByText(/start new session/i).or(page.getByText(/dashboard/i)),
      ).toBeVisible({ timeout: 15000 });
    });

    test("logs out successfully", async ({ page }) => {
      test.skip(
        true,
        "Logout UI is app-role/layout dependent; enable when stable.",
      );

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
    test("maintains the session after page refresh", async ({ page }) => {
      const credentials = getRoleCredentials("staff");

      await gotoLogin(page);
      await page.getByTestId("login-username").fill(credentials.username);
      await page.getByTestId("login-password").fill(credentials.password);
      await page.getByTestId("login-submit").click();

      await assertAuthenticated(page, "staff", {
        expectedPath: /\/staff\/home(?:\?.*)?$/,
      });
      await expect(
        page.getByText("Start New Session", { exact: true }),
      ).toBeVisible({ timeout: 15000 });

      await page.reload();

      await assertAuthenticated(page, "staff", {
        expectedPath: /\/staff\/home(?:\?.*)?$/,
      });
      await expect(
        page.getByText("Start New Session", { exact: true }),
      ).toBeVisible({ timeout: 15000 });
    });
  });
});

test.describe("PIN Authentication", () => {
  test("allows PIN-based quick login when configured", async ({
    page,
  }) => {
    test.skip(true, "PIN feature test - requires configured PIN");

    await gotoLogin(page);

    await ensureCredentialsMode(page);

    const pinOption = page.getByText(/use pin|quick login|pin/i);
    if (await pinOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await pinOption.click();

      const pinInput = page.getByPlaceholder(/pin/i);
      await pinInput.fill("1234");

      await expect(
        page.getByText(/new count area/i).or(page.getByText(/dashboard/i)),
      ).toBeVisible({ timeout: 15000 });
    }
  });
});
