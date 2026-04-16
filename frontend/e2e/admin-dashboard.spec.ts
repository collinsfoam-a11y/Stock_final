import { test, expect } from "@playwright/test";
import { authenticateAs } from "./helpers/auth";

test.describe("Admin Dashboard", () => {
  test.beforeEach(async ({ page, request }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await authenticateAs(page, request, "admin");
  });

  test("uses the consolidated dashboard and quick tools", async ({ page }) => {
    await page.goto("/admin");

    await expect(page).toHaveURL(/\/admin\/dashboard-web$/);
    await expect(page.getByText("Admin Dashboard")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByTestId("overview-panel")).toBeVisible();

    await page.getByTestId("admin-tool-users").click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByText("User Management")).toBeVisible();
  });

  test("initial admin load avoids health probe preflights and CSP errors", async ({
    page,
  }) => {
    const healthProbeErrors: string[] = [];
    const healthProbePreflightFailures: string[] = [];

    page.on("console", (message) => {
      if (message.type() !== "error") {
        return;
      }

      const text = message.text();
      if (/api\/health|Content Security Policy|connect-src/i.test(text)) {
        healthProbeErrors.push(text);
      }
    });

    page.on("response", (response) => {
      const request = response.request();
      if (
        request.method() === "OPTIONS" &&
        /\/api\/health$/i.test(response.url()) &&
        response.status() >= 400
      ) {
        healthProbePreflightFailures.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto(`/admin?cb=${Date.now()}`);

    await expect(page).toHaveURL(/\/admin\/dashboard-web(?:\?.*)?$/);
    await expect(page.getByTestId("overview-panel")).toBeVisible({
      timeout: 20000,
    });
    await page.waitForTimeout(1500);

    expect(healthProbeErrors).toEqual([]);
    expect(healthProbePreflightFailures).toEqual([]);
  });

  test("legacy metrics and reports routes deep-link into dashboard tabs", async ({
    page,
  }) => {
    await page.goto("/admin/metrics");

    await expect(page).toHaveURL(/\/admin\/dashboard-web\?tab=monitoring$/);
    await expect(page.getByTestId("monitoring-panel")).toBeVisible();
    await expect(page.getByText("Services Status")).toBeVisible();
    await expect(page.getByTestId("service-toggle-backend")).toBeVisible();
    await expect(page.getByTestId("service-toggle-frontend")).toBeVisible();

    await page.goto("/admin/reports");

    await expect(page).toHaveURL(/\/admin\/dashboard-web\?tab=reports$/);
    await expect(page.getByTestId("reports-panel")).toBeVisible();
    await expect(page.getByTestId("dashboard-tab-reports")).toBeVisible();
    await expect(page.getByTestId("generate-report-user_activity")).toBeVisible();
  });

  test("loads the diagnosis tab on the consolidated dashboard", async ({
    page,
  }) => {
    await page.goto("/admin/dashboard-web?tab=diagnosis");

    await expect(page).toHaveURL(/\/admin\/dashboard-web\?tab=diagnosis$/);
    await expect(page.getByTestId("diagnosis-panel")).toBeVisible();
    await expect(page.getByText("System Self-Diagnosis")).toBeVisible();
    await expect(page.getByText("Total Issues")).toBeVisible();
    await expect(page.getByText("Critical")).toBeVisible();
    await expect(page.getByText("Auto-Fixable")).toBeVisible();
  });

  test("admin users screen exposes create and edit flows", async ({
    page,
  }) => {
    await page.goto("/admin/users");

    await expect(page.getByText("User Management")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByTestId("users-screen-ready")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByTestId("user-row-admin")).toBeVisible({
      timeout: 20000,
    });

    await page.getByTestId("users-add-button").dispatchEvent("click");
    await expect(page.getByTestId("user-form-username")).toBeVisible();
    await expect(page.getByTestId("user-form-submit")).toContainText(
      "Create User",
    );
    await page.getByTestId("user-form-close").dispatchEvent("click");

    await page.getByTestId("user-edit-admin").dispatchEvent("click");
    await expect(page.getByTestId("user-form-submit")).toContainText(
      "Save Changes",
    );
    await expect(page.getByTestId("user-form-username")).toHaveValue("admin");
    await expect(page.getByTestId("user-form-role-admin")).toBeVisible();
  });
});
