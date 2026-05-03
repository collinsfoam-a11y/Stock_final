import { test, expect } from "@playwright/test";
import {
  getAuthenticatedSession,
  seedAuthState,
} from "./helpers/auth";
import { installStabilityMocks } from "./helpers/stabilityMocks";

test.describe("Supervisor smoke flow", () => {
  test("dashboard and navigation render for supervisor", async ({
    page,
    request,
  }) => {
    await installStabilityMocks(page);
    const session = await getAuthenticatedSession(request, "supervisor");

    await seedAuthState(page, {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      user: session.user,
    });

    await page.goto("/");

    await expect(page).toHaveURL(/\/supervisor\/dashboard(?:\?.*)?$/);
    await expect(
      page.getByTestId("supervisor-dashboard-action-create-session"),
    ).toBeVisible({
      timeout: 30000,
    });
    await expect(
      page.getByTestId("supervisor-dashboard-action-view-sessions"),
    ).toBeVisible();
    await expect(
      page.getByTestId("supervisor-dashboard-action-resolve-differences"),
    ).toBeVisible();

    await page.getByTestId("supervisor-dashboard-action-view-sessions").click();

    await expect(page).toHaveURL(/\/supervisor\/sessions(?:\?.*)?$/);
    await expect(page.getByText("All Sessions")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/supervisor\/dashboard(?:\?.*)?$/);
    await expect(page.getByTestId("supervisor-create-session-title")).not.toBeVisible();
    await page.getByTestId("supervisor-dashboard-action-create-session").click();
    await expect(page.getByTestId("supervisor-create-session-title")).toBeVisible();
  });

  test("legacy bulk ops route redirects to variances", async ({
    page,
    request,
  }) => {
    await installStabilityMocks(page);
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
    await expect(page.getByTestId("supervisor-variances-screen")).toBeVisible();
  });
});
