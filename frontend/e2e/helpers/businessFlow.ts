import { expect, type BrowserContext, type Locator, type Page, type Response } from "@playwright/test";

const parseNumber = (value: string) => {
  const normalized = value.replace(/[^0-9.+-]/g, "");
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) {
    throw new Error(`Unable to parse numeric value from "${value}"`);
  }
  return parsed;
};

const sanitizeSegment = (value: string) =>
  value.replace(/[^a-zA-Z0-9_-]+/g, "_");

const quantityInput = (page: Page) => page.getByPlaceholder("0").first();
const varianceReasonInput = (page: Page) =>
  page.getByPlaceholder("Variance reason (if any)");
const scanSearchInput = (page: Page) =>
  page.getByPlaceholder("Enter barcode or item code...");

export const waitForScanScreenReady = async (page: Page) => {
  await page.waitForURL("**/staff/scan?sessionId=**", { timeout: 60000 });
  await expect(scanSearchInput(page)).toBeVisible();
};

export const waitForItemDetailReady = async (page: Page) => {
  await page.waitForURL("**/staff/item-detail?**", { timeout: 30000 });
  await expect(page.getByText("Verify Item", { exact: true })).toBeVisible();
};

export const historyCardTestId = (itemCode: string) =>
  `history-card-${sanitizeSegment(itemCode)}`;

export const sessionLineTestId = (itemCode: string) =>
  `session-line-${sanitizeSegment(itemCode)}`;

export const varianceCardTestId = (itemCode: string) =>
  `variance-card-${sanitizeSegment(itemCode)}`;

export const createSessionFromStaffHome = async (page: Page, rackMarker: string) => {
  await page.goto("/staff/home");
  await expect(page.getByText("Start New Session", { exact: true })).toBeVisible();
  await page.getByText("Start New Session", { exact: true }).click();
  await expect(page.getByText("New Session", { exact: true })).toBeVisible();
  await page.getByText("Showroom", { exact: true }).click();
  await page.getByText("Ground Floor", { exact: true }).click();
  await page.getByPlaceholder("e.g. A-123").fill(rackMarker);
  await page.getByText("Start Session", { exact: true }).click();
  await page.waitForURL("**/staff/scan?sessionId=**", { timeout: 30000 });
  const currentUrl = new URL(page.url());
  const sessionId = currentUrl.searchParams.get("sessionId");
  if (!sessionId) {
    throw new Error("Session ID missing from scan URL");
  }
  await expect(scanSearchInput(page)).toBeVisible();
  return sessionId;
};

export const searchAndOpenItem = async (page: Page, barcodeOrCode: string) => {
  const searchInput = scanSearchInput(page);
  await expect(searchInput).toBeVisible();
  await searchInput.fill(barcodeOrCode);
  await page.getByTestId("scan-search-submit").click();
  await waitForItemDetailReady(page);
};

export const cacheItemAndReturnToScan = async (page: Page, barcodeOrCode: string) => {
  await searchAndOpenItem(page, barcodeOrCode);
  await page.getByRole("button", { name: "Back" }).click().catch(() => undefined);
  if (!/\/staff\/scan/.test(new URL(page.url()).pathname)) {
    await page.goBack();
  }
  await waitForScanScreenReady(page);
};

export const fillCurrentItemCount = async (
  page: Page,
  options: {
    quantity: number | string;
    varianceReason?: string;
  },
) => {
  await expect(quantityInput(page)).toBeVisible();
  await quantityInput(page).fill(String(options.quantity));
  if (options.varianceReason !== undefined) {
    await varianceReasonInput(page).fill(options.varianceReason);
  }
};

export const submitCurrentItemAndWaitForScan = async (page: Page) => {
  await page.getByRole("button", { name: "Save & Verify" }).click();
  await waitForScanScreenReady(page);
};

export const submitCurrentItemAndCaptureResponse = async (page: Page): Promise<Response> => {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/api/count-lines"),
    { timeout: 20000 },
  );
  await page.getByRole("button", { name: "Save & Verify" }).click();
  const response = await responsePromise;
  await waitForScanScreenReady(page);
  return response;
};

export const openStaffHistory = async (page: Page, sessionId: string) => {
  await page.goto(`/staff/history?sessionId=${encodeURIComponent(sessionId)}`);
  await expect(page.getByText("Count History", { exact: true })).toBeVisible();
};

export const readHistoryMetrics = async (page: Page, itemCode: string) => {
  const base = page.getByTestId(historyCardTestId(itemCode));
  await expect(base).toBeVisible({ timeout: 30000 });
  return {
    counted: parseNumber(await page.getByTestId(`${historyCardTestId(itemCode)}-counted`).innerText()),
    erp: parseNumber(await page.getByTestId(`${historyCardTestId(itemCode)}-erp`).innerText()),
    status: (await page.getByTestId(`${historyCardTestId(itemCode)}-status`).innerText()).trim(),
    variance: parseNumber(await page.getByTestId(`${historyCardTestId(itemCode)}-variance`).innerText()),
  };
};

export const openStaffSettings = async (page: Page) => {
  await page.goto("/staff/settings");
  await expect(page.getByText("Settings", { exact: true })).toBeVisible();
};

const readToggleState = async (toggle: Locator) =>
  toggle.evaluate((element: Element) => {
    const input = element as HTMLInputElement;
    if (typeof input.checked === "boolean") {
      return input.checked;
    }
    return element.getAttribute("aria-checked") === "true";
  });

export const setOfflineMode = async (page: Page, enabled: boolean) => {
  const toggle = page.getByTestId("offline-mode-toggle-switch");
  await expect(toggle).toBeVisible({ timeout: 15000 });
  const current = await readToggleState(toggle);
  if (current !== enabled) {
    await toggle.click();
    await expect
      .poll(async () => readToggleState(toggle), {
        timeout: 10000,
      })
      .toBe(enabled);
  }
};

export const setBrowserOffline = async (context: BrowserContext, enabled: boolean) => {
  await context.setOffline(enabled);
};

export const waitForSyncToSettle = async (page: Page) => {
  const pill = page.getByTestId("sync-status-pill");
  await expect(pill).toBeVisible({ timeout: 15000 });
  await expect
    .poll(async () => page.getByTestId("sync-status-label").innerText(), {
      timeout: 30000,
    })
    .toMatch(/Synced|Offline/);
};

export const forceSyncUntilSynced = async (page: Page) => {
  const pill = page.getByTestId("sync-status-pill");
  await expect(pill).toBeVisible({ timeout: 15000 });
  await pill.click();
  await expect
    .poll(async () => (await page.getByTestId("sync-status-label").innerText()).trim(), {
      timeout: 30000,
    })
    .toBe("Synced");
};

export const openSessionDetailAsSupervisor = async (page: Page, sessionId: string) => {
  await page.goto(`/supervisor/session/${encodeURIComponent(sessionId)}`);
  await expect(page.getByText("Session Details")).toBeVisible({ timeout: 30000 });
};

export const readSessionLineMetrics = async (page: Page, itemCode: string) => {
  const baseId = sessionLineTestId(itemCode);
  await expect(page.getByTestId(baseId)).toBeVisible({ timeout: 30000 });
  return {
    counted: parseNumber(await page.getByTestId(`${baseId}-counted`).innerText()),
    erp: parseNumber(await page.getByTestId(`${baseId}-erp`).innerText()),
    status: (await page.getByTestId(`${baseId}-status`).innerText()).trim(),
    variance: parseNumber(await page.getByTestId(`${baseId}-variance`).innerText()),
  };
};

export const readVarianceCardMetrics = async (page: Page, itemCode: string) => {
  const baseId = varianceCardTestId(itemCode);
  await expect(page.getByTestId(baseId)).toBeVisible({ timeout: 30000 });
  return {
    itemCode: (await page.getByTestId(`${baseId}-item-code`).innerText()).trim(),
    location: (await page.getByTestId(`${baseId}-location`).innerText()).trim(),
    systemQty: parseNumber(await page.getByTestId(`${baseId}-system-qty`).innerText()),
    variance: parseNumber(await page.getByTestId(`${baseId}-variance`).innerText()),
    verifiedQty: parseNumber(await page.getByTestId(`${baseId}-verified-qty`).innerText()),
  };
};

export const parseCsv = (csvText: string) => {
  const [headerLine, ...lines] = csvText.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const columns = line.split(",");
      return headers.reduce<Record<string, string>>((row, header, index) => {
        row[header] = columns[index] ?? "";
        return row;
      }, {});
    });
};
