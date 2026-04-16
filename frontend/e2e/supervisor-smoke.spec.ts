import { test, expect } from "@playwright/test";
import {
  getAuthenticatedSession,
  seedAuthState,
} from "./helpers/auth";

test.describe("Supervisor smoke flow", () => {
  test("dashboard and navigation render for supervisor", async ({
    page,
    request,
  }) => {
    const session = await getAuthenticatedSession(request, "supervisor");

    await seedAuthState(page, {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      user: session.user,
    });

    await page.goto("/");

    await expect(page).toHaveURL(/\/supervisor\/dashboard(?:\?.*)?$/);
    await expect(page.getByText("Supervisor Dashboard")).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText("Supervisor overview")).toBeVisible();
    await expect(
      page.getByText("Keep sessions moving and catch issues early."),
    ).toBeVisible();
    await expect(page.getByText("Create session")).toBeVisible();
    await expect(page.getByText("Review variances")).toBeVisible();
    await expect(page.getByText("Recent Sessions")).toBeVisible();
    await expect(page.getByText("Recent Activity", { exact: true })).toBeVisible();

    const totalSessionsCard = page.getByText("Total Sessions", {
      exact: true,
    });
    await expect(totalSessionsCard).toBeVisible();
    await totalSessionsCard.click();

    await expect(page).toHaveURL(/\/supervisor\/sessions(?:\?.*)?$/);
    await expect(page.getByText("All Sessions")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/supervisor\/dashboard(?:\?.*)?$/);
    await expect(page.getByText("Create New Session")).not.toBeVisible();
    await page.getByText("Create session", { exact: true }).click();
    await expect(page.getByText("Create New Session")).toBeVisible();
  });

  test("legacy bulk ops route redirects to variances", async ({
    page,
    request,
  }) => {
    const session = await getAuthenticatedSession(request, "supervisor");

    await seedAuthState(page, {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      user: session.user,
    });

    await page.goto("/");
    await expect(page).toHaveURL(/\/supervisor\/dashboard(?:\?.*)?$/);

    await page.evaluate(() => {
      window.history.pushState({}, "", "/supervisor/bulk-ops");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await expect(page).toHaveURL(/\/supervisor\/variances(?:\?.*)?$/, {
      timeout: 30000,
    });
    await expect(page.getByText(/variance/i).first()).toBeVisible();
  });
});
