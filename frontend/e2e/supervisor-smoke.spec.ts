import { test, expect } from "./fixtures/authenticated";

test.describe("Supervisor smoke flow", () => {
  test("dashboard and navigation render for supervisor", async ({ page }) => {
    await expect(page.getByText("Supervisor Dashboard")).toBeVisible({
      timeout: 30000,
    });
    await expect(
      page.getByText("Clear daily actions for your team"),
    ).toBeVisible();
    await expect(page.getByText("Supervisor overview")).toBeVisible();
    await expect(page.getByText("Real-time monitoring")).toBeVisible();
    await expect(page.getByText("Create session")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Count Sessions" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Count Differences" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Count Sessions" }).click();

    await expect(page).toHaveURL(/\/supervisor\/sessions(?:\?.*)?$/);
    await expect(page.getByText("All Sessions")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/supervisor\/dashboard(?:\?.*)?$/);
    await expect(page.getByText("Create New Session")).not.toBeVisible();
    await page.getByText("Create session", { exact: true }).click();
    await expect(page.getByText("Create New Session")).toBeVisible();
  });

  test("legacy bulk ops route redirects to variances", async ({ page }) => {
    await page.goto("/supervisor/bulk-ops");

    await expect(page).toHaveURL(/\/supervisor\/variances(?:\?.*)?$/, {
      timeout: 30000,
    });
    await expect(page.getByText(/variance/i).first()).toBeVisible();
  });
});
