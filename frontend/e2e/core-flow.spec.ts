import { test, expect } from "@playwright/test";
import {
  createSessionAs,
  getAuthenticatedSession,
  seedAuthState,
} from "./helpers/auth";

const INVALID_ACCESS_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJzdWIiOiJzdGFmZjEiLCJyb2xlIjoic3RhZmYiLCJleHAiOjQxMDI0NDQ4MDB9." +
  "invalid-signature";

test.describe("Core User Flow", () => {
  test("Login -> Create Session -> Scan -> Verify -> Logout", async ({
    page,
  }) => {
    test.setTimeout(300000); // 5 minutes

    // Debug Network & Errors
    page.on("requestfailed", (request) =>
      console.log(
        `Request failed: ${request.url()} ${request.failure()?.errorText}`,
      ),
    );
    page.on("pageerror", (exception) =>
      console.log(`Page Error: ${exception}`),
    );
    page.on("console", (msg) => console.log(`Browser console: ${msg.text()}`));
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    // Mock Permissions API to prevent Safari errors with Expo Camera
    await page.addInitScript(() => {
      if (navigator.permissions) {
        // @ts-ignore
        navigator.permissions.query = async () => ({
          state: "granted",
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        });
      }
    });

    // 1. Login
    await page.goto("/login?e2e=1");
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();

    await page.getByPlaceholder("Enter your username").fill("staff1");
    await page.getByPlaceholder("Enter your password").fill("staff123");
    await page.getByRole("button", { name: "Sign In" }).click();

    await page.waitForURL("**/staff/home**", { timeout: 30000 });
    await expect(
      page.getByText("Start New Session", { exact: true }),
    ).toBeVisible();

    // 2. Create Session
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
    await expect(page.getByRole("button", { name: "Finish Rack" })).toBeVisible();

    // 3. Search/Lookup item
    await page.getByPlaceholder("Enter barcode or item code...").fill("513456");
    await page.getByTestId("scan-search-submit").click();

    await page.waitForURL("**/staff/item-detail?**", { timeout: 30000 });
    await expect(page.getByText("Verify Item", { exact: true })).toBeVisible();
    await expect(page.getByText("Counted Quantity")).toBeVisible();

    // 4. Enter quantity
    const qtyInput = page.locator(
      'xpath=//*[contains(normalize-space(.),"Counted Quantity")]/following::input[@placeholder="0"][1]',
    );
    await expect(qtyInput).toBeVisible();
    await qtyInput.fill("10");
    await page
      .getByPlaceholder("Variance reason (if any)")
      .fill("E2E variance");

    // 5. Save & Verify (wait for countdown submit to finish and navigate back)
    await page.getByRole("button", { name: "Save & Verify" }).click();
    await expect(page.getByText(/Undo \(\d+s\)/)).toBeVisible({
      timeout: 5000,
    });
    await page.waitForURL("**/staff/scan?sessionId=**", { timeout: 60000 });
    await expect(
      page.getByPlaceholder("Enter barcode or item code..."),
    ).toBeVisible();

    // 6. Logout via Settings page
    await page.goto("/staff/settings");
    await expect(page.getByText("Sign Out", { exact: true })).toBeVisible();
    await page.getByText("Sign Out", { exact: true }).click();
    await page.waitForURL("**/welcome", { timeout: 30000 });
    await expect(page.getByText("Lavanya E-Mart")).toBeVisible();

    console.log("Flow Completed Successfully");
  });

  test("stale auth on scan redirects cleanly without retry storms", async ({
    page,
    request,
  }) => {
    const session = await getAuthenticatedSession(request, "staff");
    const createdSession = await createSessionAs(request, "staff", {
      warehouse: `stale-auth-${Date.now()}`,
    });

    const statsResponses: string[] = [];
    const refreshResponses: string[] = [];
    const websocketAttempts: string[] = [];

    page.on("response", (response) => {
      const url = response.url();
      if (url.includes(`/api/sessions/${createdSession.id}/stats`)) {
        statsResponses.push(`${response.status()} ${url}`);
      }
      if (url.includes("/api/auth/refresh")) {
        refreshResponses.push(`${response.status()} ${url}`);
      }
    });

    page.on("websocket", (websocket) => {
      if (websocket.url().includes("/ws/updates")) {
        websocketAttempts.push(websocket.url());
      }
    });

    await seedAuthState(
      page,
      {
        accessToken: INVALID_ACCESS_TOKEN,
        user: session.user,
      },
      { clearRefreshToken: true },
    );

    await page.goto(`/staff/scan?sessionId=${encodeURIComponent(createdSession.id)}`);

    await page.waitForURL(/\/welcome(?:\?.*)?$/, { timeout: 20000 });
    await page.waitForTimeout(6000);

    expect(statsResponses.length).toBeLessThanOrEqual(2);
    expect(refreshResponses.length).toBeLessThanOrEqual(1);
    expect(websocketAttempts.length).toBeLessThanOrEqual(1);
  });
});
