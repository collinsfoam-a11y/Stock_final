import { test, expect } from "./fixtures/authenticated";

import { createRoleApiContext } from "./helpers/auth";
import { resolveAppUrl } from "./helpers/authConfig";

type ERPItemsResponse = {
  items: Array<{
    barcode?: string;
    item_code: string;
    item_name: string;
  }>;
};

test.describe("Core User Flow", () => {
  test("Create Session -> Scan -> Verify -> Logout", async ({
    page,
    playwright,
  }) => {
    test.setTimeout(180000);

    const apiContext = await createRoleApiContext(
      playwright,
      "staff",
      "playwright-staff-core-flow",
    );

    let erpItem:
      | ERPItemsResponse["items"][number]
      | undefined;

    try {
      const response = await apiContext.get("/api/erp/items?page=1&page_size=50");
      expect(response.ok()).toBeTruthy();
      const payload = (await response.json()) as ERPItemsResponse;
      erpItem = payload.items.find((item) => item.barcode);
    } finally {
      await apiContext.dispose();
    }

    expect(erpItem?.barcode).toBeTruthy();

    await expect(
      page.getByText("Start New Session", { exact: true }),
    ).toBeVisible();

    await page.getByText("Start New Session", { exact: true }).click();
    await expect(page.getByText("New Session", { exact: true })).toBeVisible();

    await page.getByText("Showroom", { exact: true }).click();
    await page.getByText("Ground Floor", { exact: true }).click();
    await page.getByPlaceholder("e.g. A-123").fill("A-123");
    await page.getByText("Start Session", { exact: true }).click();

    await page.waitForURL("**/staff/scan?sessionId=**", { timeout: 30000 });
    await expect(
      page.getByPlaceholder("Enter barcode or item code..."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Finish Rack" }),
    ).toBeVisible();

    await page
      .getByPlaceholder("Enter barcode or item code...")
      .fill(erpItem!.barcode!);
    await page.getByTestId("scan-search-submit").click();

    await page.waitForURL("**/staff/item-detail?**", { timeout: 30000 });
    await expect(page.getByText("Verify Item", { exact: true })).toBeVisible();
    await expect(page.getByText("Count", { exact: true })).toBeVisible();

    const qtyInput = page.getByPlaceholder("0").first();
    await expect(qtyInput).toBeVisible();
    await qtyInput.fill("10");
    await page
      .getByPlaceholder("Variance reason (if any)")
      .fill("Playwright core flow variance");

    await page.getByRole("button", { name: "Save & Verify" }).click();
    await expect(page.getByText(/Undo \(\d+s\)/)).toBeVisible({
      timeout: 5000,
    });
    await page.waitForURL("**/staff/scan?sessionId=**", { timeout: 60000 });
    await expect(
      page.getByPlaceholder("Enter barcode or item code..."),
    ).toBeVisible();

    await page.goto(resolveAppUrl("/staff/settings"));
    await expect(page.getByText("Sign Out", { exact: true })).toBeVisible();
    await page.getByText("Sign Out", { exact: true }).click();
    await page.waitForURL("**/welcome", { timeout: 30000 });
    await expect(page.getByText("Start a session")).toBeVisible();
  });
});
