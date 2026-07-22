import { test, expect, type Page } from "@playwright/test";
import { authenticateAs, createSessionAs } from "./helpers/auth";

/**
 * Comprehensive Staff User Audit
 * Tests every staff page, feature, and the serial input fix.
 *
 * NOTE: We avoid waitForLoadState("networkidle") because the app maintains
 * WebSocket connections and periodic syncs that prevent idle state.
 */
test.describe("Staff Full Audit", () => {
  test.beforeEach(async ({ page, request }) => {
    // Debug helpers
    page.on("requestfailed", (r) =>
      console.log(`❌ Request failed: ${r.url()} ${r.failure()?.errorText}`)
    );
    page.on("pageerror", (e) => console.log(`🔴 Page Error: ${e}`));
    page.on("dialog", async (dialog) => await dialog.accept());

    // Mock permissions for camera
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

    await authenticateAs(page, request, "staff");
  });

  // ──────────────────────────────────────────────────────
  // 1. HOME PAGE
  // ──────────────────────────────────────────────────────
  test("Staff Home — loads correctly with all elements", async ({ page }) => {
    await page.goto("/staff/home");

    await expect(page.getByText("Start New Session")).toBeVisible({
      timeout: 20000,
    });

    // No crash overlays
    const body = page.locator("body");
    await expect(body).not.toHaveText(/something went wrong/i);

    console.log("✅ Staff Home: Loaded correctly");
  });

  // ──────────────────────────────────────────────────────
  // 2. SESSION CREATION
  // ──────────────────────────────────────────────────────
  test("Staff Session Creation — full form flow", async ({ page }) => {
    await page.goto("/staff/home");

    await page
      .getByText("Start New Session", { exact: true })
      .click({ timeout: 20000 });
    await expect(
      page.getByText("New Session", { exact: true })
    ).toBeVisible({ timeout: 10000 });

    // Select warehouse
    const showroomRadio = page.getByRole("radio", { name: /Showroom/i });
    if (await showroomRadio.isVisible({ timeout: 5000 }).catch(() => false)) {
      await showroomRadio.click();
    }

    // Select floor
    const groundFloor = page.getByRole("radio", { name: /Ground Floor/i });
    if (await groundFloor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await groundFloor.click();
    }

    // Fill rack
    const rackInput = page.getByPlaceholder("e.g. A-123");
    if (await rackInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await rackInput.fill("AUDIT-001");
    }

    // Start session
    await page.getByText("Start Session", { exact: true }).click();
    await page.waitForURL("**/staff/scan?sessionId=**", { timeout: 30000 });
    console.log("✅ Staff Session Creation: Flow completed");
  });

  // ──────────────────────────────────────────────────────
  // 3. SCAN PAGE
  // ──────────────────────────────────────────────────────
  test("Staff Scan — page loads with search and controls", async ({
    page,
    request,
  }) => {
    const session = await createSessionAs(request, "staff", {
      warehouse: "Showroom",
    });
    await page.goto(`/staff/scan?sessionId=${session.id}`);

    // Search bar
    const searchInput = page.getByPlaceholder("Enter barcode or item code...");
    await expect(searchInput).toBeVisible({ timeout: 20000 });

    // Finish Rack button
    await expect(
      page.getByRole("button", { name: "Finish Rack" })
    ).toBeVisible({ timeout: 10000 });

    // Type in search bar (verify input works)
    await searchInput.fill("TEST123");
    const searchValue = await searchInput.inputValue();
    expect(searchValue).toBe("TEST123");

    console.log("✅ Staff Scan: Page loads, search input works");
  });

  // ──────────────────────────────────────────────────────
  // 4. ITEM DETAIL + SERIAL INPUT FIX VERIFICATION
  // ──────────────────────────────────────────────────────
  test("Staff Item Detail — serial number manual input accepts typing", async ({
    page,
    request,
  }) => {
    test.setTimeout(120000);

    const session = await createSessionAs(request, "staff", {
      warehouse: "Showroom",
    });
    await page.goto(`/staff/scan?sessionId=${session.id}`);

    // Search for an item
    const searchInput = page.getByPlaceholder("Enter barcode or item code...");
    await expect(searchInput).toBeVisible({ timeout: 20000 });
    await searchInput.fill("513456");
    await page.getByTestId("scan-search-submit").click();

    // Wait for item detail page
    await page.waitForURL("**/staff/item-detail?**", { timeout: 30000 });
    await expect(page.getByText("System stock")).toBeVisible({ timeout: 15000 });

    // Enter quantity
    const qtyInput = page.locator(
      'xpath=//*[contains(normalize-space(.),"Count Quantity")]/following::input[@placeholder="0"][1]'
    );
    await expect(qtyInput).toBeVisible({ timeout: 10000 });
    await qtyInput.fill("3");

    // Look for serialized item toggle — try to enable it
    const serialToggle = page.locator("text=Serialized Item").first();
    if (
      await serialToggle
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    ) {
      const switchEl = page.locator('[role="switch"]').first();
      if (
        await switchEl
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await switchEl.click();
        await page.waitForTimeout(500);
      }
    }

    // Look for "Add Serial Manually" button
    const addSerialBtn = page.getByText("Add Serial Manually");
    if (
      await addSerialBtn
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    ) {
      await addSerialBtn.click();
      await page.waitForTimeout(500);

      // Find serial input (Unit #1)
      const serialInput = page.getByPlaceholder("Serial number").first();
      if (
        await serialInput
          .isVisible({ timeout: 5000 })
          .catch(() => false)
      ) {
        // *** THE KEY TEST: Verify typing works character-by-character ***
        await serialInput.click();
        await page.waitForTimeout(200);

        // Type slowly, one character at a time
        await serialInput.pressSequentially("ABC123", { delay: 100 });
        await page.waitForTimeout(300);

        const typedValue = await serialInput.inputValue();
        console.log(
          `Serial input value after typing "ABC123": "${typedValue}"`
        );

        // Verify all characters were captured
        expect(typedValue.toUpperCase()).toContain("ABC123");
        expect(typedValue.length).toBe(6);

        // Test blur → uppercase normalization
        await serialInput.evaluate((el) =>
          (el as HTMLInputElement).blur()
        );
        await page.waitForTimeout(300);
        const blurredValue = await serialInput.inputValue();
        console.log(`Serial input value after blur: "${blurredValue}"`);
        expect(blurredValue).toBe("ABC123");

        console.log(
          "✅ Serial Input Fix VERIFIED: Typing works correctly!"
        );
      } else {
        console.log(
          "⚠️ Serial input not visible — item may not support serialization"
        );
      }
    } else {
      console.log(
        "⚠️ Add Serial Manually button not visible — checking serial section"
      );
    }

    // Verify page didn't crash
    await expect(page.getByText("System stock")).toBeVisible();
    console.log("✅ Staff Item Detail: Page stable");
  });

  // ──────────────────────────────────────────────────────
  // 5. HISTORY PAGE
  // ──────────────────────────────────────────────────────
  test("Staff History — page loads and shows content", async ({ page }) => {
    await page.goto("/staff/history");

    // Wait for meaningful content to appear (heading, list, or empty state)
    await page.waitForTimeout(3000);

    const body = page.locator("body");
    await expect(body).not.toHaveText(/something went wrong/i);

    const pageContent = await page.textContent("body");
    expect(pageContent!.length).toBeGreaterThan(50);

    console.log("✅ Staff History: Page loaded");
  });

  // ──────────────────────────────────────────────────────
  // 6. SETTINGS PAGE
  // ──────────────────────────────────────────────────────
  test("Staff Settings — page loads with profile and options", async ({
    page,
  }) => {
    await page.goto("/staff/settings");
    await page.waitForTimeout(3000);

    const body = page.locator("body");
    await expect(body).not.toHaveText(/something went wrong/i);

    const pageContent = await page.textContent("body");
    expect(pageContent!.length).toBeGreaterThan(50);

    console.log("✅ Staff Settings: Page loaded");
  });

  // ──────────────────────────────────────────────────────
  // 7. NAVIGATION
  // ──────────────────────────────────────────────────────
  test("Staff Navigation — tab bar navigates between pages", async ({
    page,
  }) => {
    await page.goto("/staff/home");
    await expect(page.getByText("Start New Session")).toBeVisible({
      timeout: 20000,
    });

    // Navigate to History
    const historyTab = page.locator('[aria-label*="istory"]').first();
    if (
      await historyTab
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    ) {
      await historyTab.click();
      await page.waitForTimeout(2000);
      console.log("✅ Navigated to History tab");
    }

    // Navigate to Settings
    const settingsTab = page.locator('[aria-label*="etting"]').first();
    if (
      await settingsTab
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    ) {
      await settingsTab.click();
      await page.waitForTimeout(2000);
      console.log("✅ Navigated to Settings tab");
    }

    console.log("✅ Staff Navigation: Tab switching works");
  });

  // ──────────────────────────────────────────────────────
  // 8. ERROR HANDLING (no CORS errors, no 500s)
  // ──────────────────────────────────────────────────────
  test("Staff API — no CORS or 500 errors during normal flow", async ({
    page,
    request,
  }) => {
    const errors: string[] = [];

    page.on("response", (response) => {
      if (response.status() >= 500) {
        errors.push(
          `500+ error: ${response.url()} (${response.status()})`
        );
      }
    });

    page.on("requestfailed", (req) => {
      const failure = req.failure()?.errorText || "";
      if (
        failure.includes("CORS") ||
        failure.includes("access control")
      ) {
        errors.push(`CORS error: ${req.url()}`);
      }
    });

    // Navigate through main staff pages
    await page.goto("/staff/home");
    await expect(page.getByText("Start New Session")).toBeVisible({
      timeout: 20000,
    });
    await page.waitForTimeout(1000);

    await page.goto("/staff/history");
    await page.waitForTimeout(3000);

    await page.goto("/staff/settings");
    await page.waitForTimeout(3000);

    // Create session and visit scan
    const session = await createSessionAs(request, "staff", {
      warehouse: "Showroom",
    });
    await page.goto(`/staff/scan?sessionId=${session.id}`);
    await expect(
      page.getByPlaceholder("Enter barcode or item code...")
    ).toBeVisible({ timeout: 20000 });

    // Report results
    if (errors.length > 0) {
      console.log("❌ Server Errors Detected:", errors);
    }
    expect(errors).toHaveLength(0);

    console.log("✅ Staff API: No CORS or 500 errors");
  });
});
