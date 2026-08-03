import { expect, test, type Page } from "@playwright/test";

import {
  getAuthenticatedSession,
  seedAuthState,
} from "./helpers/auth";

function attachPageErrorCollector(page: Page) {
  const pageErrors: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  return pageErrors;
}

test.describe("Supervisor watchtower regressions", () => {
  test("watchtower renders without runtime crashes", async ({
    page,
    request,
  }) => {
    const session = await getAuthenticatedSession(request, "supervisor");
    const pageErrors = attachPageErrorCollector(page);

    await seedAuthState(page, {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      user: session.user,
    });

    await page.goto("/");
    await expect(page).toHaveURL(/\/supervisor\/dashboard(?:\?.*)?$/);
    await page.evaluate(() => {
      window.history.pushState({}, "", "/supervisor/watchtower");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await expect(page).toHaveURL(/\/supervisor\/watchtower(?:\?.*)?$/);
    await expect(page.getByText("Watchtower", { exact: true })).toBeVisible();
    await expect(page.getByText("Hourly Throughput")).toBeVisible();
    await expect(page.getByText("Recent Activity", { exact: true })).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("missing supervisor sessions render recovery UI instead of crashing", async ({
    page,
    request,
  }) => {
    const session = await getAuthenticatedSession(request, "supervisor");
    const pageErrors = attachPageErrorCollector(page);

    await seedAuthState(page, {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      user: session.user,
    });

    await page.goto("/");
    await expect(page).toHaveURL(/\/supervisor\/dashboard(?:\?.*)?$/);
    await page.evaluate((missingId) => {
      window.history.pushState({}, "", `/supervisor/session/${missingId}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `playwright-missing-${Date.now()}`);

    await expect(
      page.getByText("This session is no longer available."),
    ).toBeVisible();
    await expect(page.getByText("Back to Sessions")).toBeVisible();

    await page.getByText("Back to Sessions").click();
    await expect(page).toHaveURL(/\/supervisor\/sessions(?:\?.*)?$/);

    expect(pageErrors).toEqual([]);
  });
});
