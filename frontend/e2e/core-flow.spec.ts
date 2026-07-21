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

    await page.getByRole("radio", { name: /Showroom/i }).click();
    await page.getByRole("radio", { name: /Ground Floor/i }).click();
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
    await expect(page.getByText("System stock")).toBeVisible();
    await expect(page.getByText("Count Quantity")).toBeVisible();

    // 4. Enter quantity
    const qtyInput = page.locator(
      'xpath=//*[contains(normalize-space(.),"Count Quantity")]/following::input[@placeholder="0"][1]',
    );
    await expect(qtyInput).toBeVisible();
    await qtyInput.fill("10");
    await page
      .getByPlaceholder("Variance reason (if any)")
      .fill("E2E manual verify count");
    await page.getByText("Submit Count", { exact: true }).click();

    // 5. Verify redirect back to scan screen
    await page.waitForURL("**/staff/scan?**", { timeout: 30000 });
    await expect(page.getByText("Session Summary")).toBeVisible();

    // 6. Logout
    await page.getByText("Logout", { exact: true }).click();
    await page.waitForURL("**/login**", { timeout: 30000 });
  });

  test("stale auth on scan redirects cleanly without retry storms", async ({
    page,
    request,
  }) => {
    const createdSession = await createSessionAs(request, "staff", {
      warehouse: "Showroom",
    });
    const statsResponses: string[] = [];
    const refreshResponses: string[] = [];
    const websocketAttempts: string[] = [];

    page.on("request", (req) => {
      const url = req.url();
      if (url.includes(`/api/sessions/${createdSession.id}/stats`)) {
        statsResponses.push(url);
      }
      if (url.includes("/api/auth/refresh")) {
        refreshResponses.push(url);
      }
    });

    page.on("websocket", (ws) => {
      websocketAttempts.push(ws.url());
    });

    await page.addInitScript(() => {
      window.localStorage.clear();
      window.localStorage.setItem("auth_token", "invalid-expired-token");
      window.localStorage.setItem("refresh_token", "invalid-refresh-token");
      window.localStorage.setItem(
        "auth_user",
        JSON.stringify({
          id: "e2e-staff",
          username: "staff1",
          full_name: "Staff Member",
          role: "staff",
          is_active: true,
          permissions: [],
        })
      );
    });

    await page.goto(`/staff/scan?sessionId=${encodeURIComponent(createdSession.id)}`);

    await page.waitForURL(/\/(?:welcome|login)(?:\?.*)?$/, { timeout: 20000 });
    await page.waitForTimeout(6000);

    expect(statsResponses.length).toBeLessThanOrEqual(2);
    expect(refreshResponses.length).toBeLessThanOrEqual(3);
    expect(websocketAttempts.length).toBeLessThanOrEqual(2);
  });
});
