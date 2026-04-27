import type { Page } from "@playwright/test";

import { test, expect } from "./fixtures/authenticated";

function attachPageErrorCollector(page: Page) {
  const pageErrors: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  return pageErrors;
}

test.describe("Supervisor watchtower regressions", () => {
  test("watchtower renders without runtime crashes", async ({ page }) => {
    const pageErrors = attachPageErrorCollector(page);

    await page.goto("/supervisor/watchtower");
    await expect(page).toHaveURL(/\/supervisor\/watchtower(?:\?.*)?$/);
    await expect(page.getByText("Watchtower", { exact: true })).toBeVisible();
    await expect(page.getByText("Hourly Throughput")).toBeVisible();
    await expect(page.getByText("Recent Activity", { exact: true })).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("missing supervisor sessions render recovery UI instead of crashing", async ({
    page,
  }) => {
    const pageErrors = attachPageErrorCollector(page);

    await page.goto(`/supervisor/session/playwright-missing-${Date.now()}`);

    await expect(
      page.getByText("This session is no longer available."),
    ).toBeVisible();
    await expect(page.getByText("Back to Sessions")).toBeVisible();

    await page.getByText("Back to Sessions").click();
    await expect(page).toHaveURL(/\/supervisor\/sessions(?:\?.*)?$/);

    expect(pageErrors).toEqual([]);
  });
});
