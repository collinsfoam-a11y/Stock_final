import { test, expect } from "@playwright/test";

test.describe("Misplaced Item Verification", () => {
  test("should show warning when scanning item in wrong rack", async ({ page }) => {
    // 1. Login
    await page.goto("/login?e2e=1");
    await page.getByPlaceholder("Enter your username").fill("staff2");
    await page.getByPlaceholder("Enter your password").fill("staff123");
    await page.getByRole("button", { name: "Sign In" }).click();

    // Verify Dashboard
    await page.waitForURL("**/staff/home**", { timeout: 30000 });
    await expect(
      page.getByText("Start New Session", { exact: true }),
    ).toBeVisible();

    // 2. Start Session in Rack "B1" (Item is in A1)
    await page.getByText("Start New Session", { exact: true }).click();
    await page.getByText("Showroom", { exact: true }).click();
    await page.getByText("Ground Floor", { exact: true }).click();
    await page.getByPlaceholder("e.g. A-123").fill("B1");
    await page.getByText("Start Session", { exact: true }).click();

    // Verify Scan Screen
    await expect(
      page.getByPlaceholder("Enter barcode or item code..."),
    ).toBeVisible();

    // 3. Scan Item 510005
    await page.getByPlaceholder("Enter barcode or item code...").fill("510005");
    await page.getByTestId("scan-search-submit").click();

    // 4. Verify Item Detail and Warning - Increased timeout to 15s
    await expect(page.getByText("SAGARA CHAPPATHI ROASTER")).toBeVisible({ timeout: 15000 });

    // Expect Warning Badge Title - Exact uppercase match
    await expect(page.getByText("MISPLACED ITEM")).toBeVisible({ timeout: 5000 });

    console.log("Test Passed: Misplaced warning visible");
  });
});
