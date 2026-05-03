import { test, expect } from "@playwright/test";
import {
  createSessionAs,
  getAuthenticatedSession,
  seedAuthState,
} from "./helpers/auth";
import { installStabilityMocks } from "./helpers/stabilityMocks";

const INVALID_ACCESS_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJzdWIiOiJzdGFmZjEiLCJyb2xlIjoic3RhZmYiLCJleHAiOjQxMDI0NDQ4MDB9." +
  "invalid-signature";
const BACKEND_BASE_URL = process.env.E2E_BACKEND_URL || "http://localhost:8001";

test.describe("Core User Flow", () => {
  test("Login -> Create Session -> Scan -> Verify -> Logout", async ({
    page,
    request,
  }) => {
    test.setTimeout(300000); // 5 minutes
    const rackCode = `A-${Date.now().toString().slice(-6)}`;

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

    const staffSession = await getAuthenticatedSession(request, "staff");
    const erpItemsResponse = await request.get(
      `${BACKEND_BASE_URL}/api/erp/items?page=1&page_size=50`,
      {
        headers: {
          Authorization: `Bearer ${staffSession.access_token}`,
          "x-device-id": "playwright-core-flow",
        },
      },
    );
    expect(erpItemsResponse.ok()).toBeTruthy();
    const erpItemsPayload = (await erpItemsResponse.json()) as {
      items?: Array<{ barcode?: string }>;
    };
    const lookupBarcode = erpItemsPayload.items?.find((item) => item.barcode)?.barcode;
    if (!lookupBarcode) {
      throw new Error("No ERP item with barcode available for core-flow scan");
    }

    const waitForScanReady = async () => {
      await Promise.race([
        page.waitForURL("**/staff/scan?sessionId=**", { timeout: 60000 }),
        page.getByTestId("scan-search-input").waitFor({
          state: "visible",
          timeout: 60000,
        }),
      ]);
      await expect(page.getByTestId("scan-search-input")).toBeVisible();
      await expect(page.getByTestId("scan-finish-rack-btn")).toBeVisible();
    };

    // 1. Login
    await installStabilityMocks(page);
    await page.goto("/login?e2e=1");
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();

    await page.getByPlaceholder("Enter your username").fill("staff1");
    await page.getByPlaceholder("Enter your password").fill("staff123");
    await page.getByRole("button", { name: "Sign In" }).click();

    await page.waitForURL("**/staff/home**", { timeout: 30000 });
    await expect(page.getByTestId("staff-home-start-session-btn")).toBeVisible();

    // 2. Create Session
    await page.getByTestId("staff-home-start-session-btn").click();
    await expect(page.getByText("New Session", { exact: true })).toBeVisible();

    await page.getByTestId("staff-home-location-zone_showroom").click();
    await page.getByTestId("staff-home-floor-fl_ground").click();
    await page.getByTestId("staff-home-rack-input").fill(rackCode);
    const sessionCreateResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/sessions") &&
        response.request().method() === "POST",
      { timeout: 30000 },
    );
    await page.getByTestId("staff-home-confirm-start-session-btn").click();
    const sessionCreateResponse = await sessionCreateResponsePromise;
    expect(sessionCreateResponse.ok()).toBeTruthy();
    await waitForScanReady();

    // 3. Search/Lookup item
    await page.getByTestId("scan-search-input").fill(lookupBarcode);
    await page.getByTestId("scan-search-submit").click();

    await page.waitForURL("**/staff/item-detail?**", { timeout: 30000 });

    // 4. Enter quantity
    const qtyInput = page.getByTestId("count-qty-input");
    await expect(qtyInput).toBeVisible();
    await qtyInput.fill("10");
    await page
      .getByPlaceholder("Variance reason (if any)")
      .fill("E2E variance");

    // 5. Save & Verify (wait for countdown submit to finish and navigate back)
    const countLineCreateResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/count-lines") &&
        !response.url().includes("/api/count-lines/draft") &&
        response.request().method() === "POST",
      { timeout: 30000 },
    );
    await page.getByTestId("item-submit-btn").click();
    await expect(page.getByText(/Undo \(\d+s\)/)).toBeVisible({
      timeout: 5000,
    });
    const countLineCreateResponse = await countLineCreateResponsePromise;
    expect(countLineCreateResponse.ok()).toBeTruthy();
    await waitForScanReady();

    // 6. Logout via Settings page
    await page.goto("/staff/settings");
    const signOutButton = page.getByText("Sign Out", { exact: true }).first();
    await signOutButton.scrollIntoViewIfNeeded();
    await expect(signOutButton).toBeVisible({ timeout: 10000 });
    await signOutButton.click();
    await page.waitForURL("**/welcome", { timeout: 30000 });
    await expect(page.getByText("Stock Verification")).toBeVisible({
      timeout: 30000,
    });

    console.log("Flow Completed Successfully");
  });

  test("stale auth on scan redirects cleanly without retry storms", async ({
    page,
    request,
  }) => {
    await installStabilityMocks(page);
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

    await expect(page).toHaveURL(/\/welcome(?:\?.*)?$/, { timeout: 20000 });
    await expect
      .poll(async () => page.evaluate(() => window.localStorage.getItem("auth_token")))
      .toBeNull();

    const observedAtRedirect = {
      stats: statsResponses.length,
      refresh: refreshResponses.length,
      ws: websocketAttempts.length,
    };

    await page.waitForTimeout(2500);

    expect(statsResponses.length).toBe(observedAtRedirect.stats);
    expect(refreshResponses.length).toBe(observedAtRedirect.refresh);
    expect(websocketAttempts.length).toBe(observedAtRedirect.ws);
  });
});
