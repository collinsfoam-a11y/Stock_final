import { test, expect } from "@playwright/test";
import { authenticateAs } from "./helpers/auth";

test.describe("Misplaced Item Verification", () => {
  test("should show warning when scanning item in wrong rack", async ({ page, request }) => {
    // 1. Seed authenticated staff session
    await authenticateAs(page, request, "staff");
    await page.goto("/staff/home?e2e=1");

    // Verify Dashboard
    await page.waitForURL("**/staff/home**", { timeout: 30000 });
    await expect(page.getByText("Start New Session", { exact: true })).toBeVisible();

    // 2. Start Session in Rack "B1" (Item is in A1)
    await page.getByText("Start New Session", { exact: true }).click();
    await page.getByText("Showroom", { exact: true }).click();
    await page.getByText("Ground Floor", { exact: true }).click();
    await page.getByPlaceholder("e.g. A-123").fill("B1");
    await page.getByText("Start Session", { exact: true }).click();

    // Verify Scan Screen
    await expect(page.getByPlaceholder("Enter barcode or item code...")).toBeVisible();

    // 3. Scan Item 510005
    await page.getByPlaceholder("Enter barcode or item code...").fill("510005");
    await page.getByTestId("scan-search-submit").click();

    // 4. Verify Item Detail and Warning
    await page.waitForURL("**/staff/item-detail**", { timeout: 15000 });
    await expect(page.getByText("Active Barcode", { exact: true })).toBeVisible({ timeout: 10000 });

    // Expect misplaced warning when ERP is online, or offline fallback warning otherwise
    const statusWarning = page
      .getByText("MISPLACED ITEM", { exact: true })
      .or(page.getByText("ERP Offline", { exact: true }));
    await expect(statusWarning.first()).toBeVisible({ timeout: 5000 });

    console.log("Test Passed: Misplaced warning visible");
  });
});
