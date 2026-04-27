import { test, expect } from "./fixtures/authenticated";

test.describe("Misplaced Item Verification", () => {
  test("shows a warning when scanning an item in the wrong rack", async ({
    page,
  }) => {
    await expect(
      page.getByText("Start New Session", { exact: true }),
    ).toBeVisible();

    await page.getByText("Start New Session", { exact: true }).click();
    await page.getByText("Showroom", { exact: true }).click();
    await page.getByText("Ground Floor", { exact: true }).click();
    await page.getByPlaceholder("e.g. A-123").fill("B1");
    await page.getByText("Start Session", { exact: true }).click();

    await expect(
      page.getByPlaceholder("Enter barcode or item code..."),
    ).toBeVisible();

    await page.getByPlaceholder("Enter barcode or item code...").fill("510005");
    await page.getByTestId("scan-search-submit").click();

    await expect(page.getByText("SAGARA CHAPPATHI ROASTER")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("MISPLACED ITEM")).toBeVisible({
      timeout: 5000,
    });
  });
});
