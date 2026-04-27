import type { Page } from "@playwright/test";

import {
  AUTH_STATE_FILES,
  assertAuthenticated,
  createAuthenticatedBrowserContext,
} from "./helpers/auth";
import {
  cacheItemAndReturnToScan,
  createSessionFromStaffHome,
  fillCurrentItemCount,
  forceSyncUntilSynced,
  openSessionDetailAsSupervisor,
  openStaffHistory,
  openStaffSettings,
  parseCsv,
  readHistoryMetrics,
  readSessionLineMetrics,
  readVarianceCardMetrics,
  searchAndOpenItem,
  setBrowserOffline,
  setOfflineMode,
  submitCurrentItemAndCaptureResponse,
  submitCurrentItemAndWaitForScan,
  varianceCardTestId,
} from "./helpers/businessFlow";
import {
  createSyntheticErpItem,
  expectSingleBackendCountLine,
  inspectSyntheticFixtures,
  makeSyntheticErpItem,
  makeSyntheticMarker,
  readBackendCountLineMetrics,
  readBackendVarianceMetrics,
  registerCountLineId,
  registerSessionId,
  updateSyntheticErpItem,
} from "./helpers/businessFixtures";
import {
  expect,
  test,
  type BusinessScope,
} from "./fixtures/businessCorrectness";

const inspectBusinessState = async (
  business: BusinessScope,
  overrides: Partial<{
    count_line_ids: string[];
    item_codes: string[];
    session_ids: string[];
  }> = {},
) => {
  const inspection = await inspectSyntheticFixtures(business.adminContext, business.scope, overrides);
  inspection.session_ids.forEach((sessionId) => registerSessionId(business.scope, sessionId));
  inspection.count_line_ids.forEach((countLineId) =>
    registerCountLineId(business.scope, countLineId),
  );
  return inspection;
};

const assertHistoryMatchesBackend = async (
  page: Page,
  business: BusinessScope,
  itemCode: string,
) => {
  const ui = await readHistoryMetrics(page, itemCode);
  const inspection = await inspectBusinessState(business);
  const backend = readBackendCountLineMetrics(inspection);

  expect(ui.erp).toBe(backend.erp);
  expect(ui.counted).toBe(backend.counted);
  expect(ui.variance).toBe(backend.variance);
  expect(ui.status).toBe(backend.status.toUpperCase());

  return { backend, inspection, ui };
};

const assertSessionLineMatchesBackend = async (
  page: Page,
  business: BusinessScope,
  itemCode: string,
) => {
  const ui = await readSessionLineMetrics(page, itemCode);
  const inspection = await inspectBusinessState(business);
  const backend = readBackendCountLineMetrics(inspection);

  expect(ui.erp).toBe(backend.erp);
  expect(ui.counted).toBe(backend.counted);
  expect(ui.variance).toBe(backend.variance);
  expect(ui.status.toUpperCase()).toBe(backend.status.toUpperCase());

  return { backend, inspection, ui };
};

const assertVarianceCardMatchesBackend = async (
  page: Page,
  business: BusinessScope,
  itemCode: string,
) => {
  const ui = await readVarianceCardMetrics(page, itemCode);
  const inspection = await inspectBusinessState(business);
  const backend = readBackendVarianceMetrics(inspection);

  expect(ui.itemCode).toBe(backend.itemCode);
  expect(ui.location).toBe(backend.location);
  expect(ui.systemQty).toBe(backend.systemQty);
  expect(ui.verifiedQty).toBe(backend.verifiedQty);
  expect(ui.variance).toBe(backend.variance);

  return { backend, inspection, ui };
};

test.describe("Business correctness", () => {
  test("snapshot integrity keeps the original session baseline", async ({
    business,
    page,
  }) => {
    test.setTimeout(240000);

    const rackMarker = makeSyntheticMarker("snapshot", business.testRunId);
    const item = makeSyntheticErpItem("snapshot", business.scope, {
      floor: "Showroom - Ground Floor",
      rack: rackMarker,
      stock_qty: 5,
    });

    await createSyntheticErpItem(business.adminContext, business.scope, item);

    const sessionId = await createSessionFromStaffHome(page, rackMarker);
    registerSessionId(business.scope, sessionId);

    await searchAndOpenItem(page, item.barcode);
    await fillCurrentItemCount(page, {
      quantity: 7,
      varianceReason: "E2E snapshot baseline",
    });
    await updateSyntheticErpItem(business.adminContext, business.scope, item.item_code, {
      stock_qty: 17,
    });
    await submitCurrentItemAndWaitForScan(page);

    await openStaffHistory(page, sessionId);
    const { backend, inspection } = await assertHistoryMatchesBackend(
      page,
      business,
      item.item_code,
    );
    expect(backend.baselineHash).not.toBe("");
    expect(inspection.state.session_snapshots.length).toBeGreaterThan(0);
    expect(backend.erp).toBe(5);
    expect(backend.counted).toBe(7);
    expect(backend.variance).toBe(2);
  });

  test("offline sync preserves the offline baseline instead of re-reading ERP", async ({
    business,
    page,
  }) => {
    test.setTimeout(240000);

    const rackMarker = makeSyntheticMarker("offline", business.testRunId);
    const item = makeSyntheticErpItem("offline", business.scope, {
      floor: "Showroom - Ground Floor",
      rack: rackMarker,
      stock_qty: 8,
    });

    await createSyntheticErpItem(business.adminContext, business.scope, item);

    const sessionId = await createSessionFromStaffHome(page, rackMarker);
    registerSessionId(business.scope, sessionId);
    await cacheItemAndReturnToScan(page, item.barcode);

    await openStaffSettings(page);
    await setOfflineMode(page, true);
    await page.goto(`/staff/scan?sessionId=${encodeURIComponent(sessionId)}`);
    await assertAuthenticated(page, "staff");
    await setBrowserOffline(page.context(), true);

    await searchAndOpenItem(page, item.barcode);
    await fillCurrentItemCount(page, {
      quantity: 10,
      varianceReason: "E2E offline baseline",
    });
    await submitCurrentItemAndWaitForScan(page);

    await updateSyntheticErpItem(business.adminContext, business.scope, item.item_code, {
      stock_qty: 30,
    });

    await setBrowserOffline(page.context(), false);
    await openStaffSettings(page);
    await setOfflineMode(page, false);
    await page.goto(`/staff/scan?sessionId=${encodeURIComponent(sessionId)}`);
    await assertAuthenticated(page, "staff");

    await forceSyncUntilSynced(page);

    await openStaffHistory(page, sessionId);
    const { backend } = await assertHistoryMatchesBackend(page, business, item.item_code);
    expect(backend.erp).toBe(8);
    expect(backend.counted).toBe(10);
    expect(backend.variance).toBe(2);
  });

  test("adding quantity clears prior approval and recalculates the line state", async ({
    business,
    page,
  }) => {
    test.setTimeout(240000);

    const rackMarker = makeSyntheticMarker("addqty", business.testRunId);
    const item = makeSyntheticErpItem("addqty", business.scope, {
      floor: "Showroom - Ground Floor",
      mrp: 10,
      rack: rackMarker,
      sales_price: 10,
      stock_qty: 5,
    });

    await createSyntheticErpItem(business.adminContext, business.scope, item);

    const sessionId = await createSessionFromStaffHome(page, rackMarker);
    registerSessionId(business.scope, sessionId);

    await searchAndOpenItem(page, item.barcode);
    await fillCurrentItemCount(page, { quantity: 5 });
    await submitCurrentItemAndWaitForScan(page);

    await openStaffHistory(page, sessionId);
    const firstState = await assertHistoryMatchesBackend(page, business, item.item_code);
    expect(firstState.backend.approvalStatus).toBe("APPROVED");
    expect(firstState.backend.variance).toBe(0);

    await page.goto(
      `/staff/item-detail?sessionId=${encodeURIComponent(sessionId)}&barcode=${encodeURIComponent(item.barcode)}`,
    );
    await fillCurrentItemCount(page, {
      quantity: 7,
      varianceReason: "E2E add quantity",
    });

    const updateResponse = await submitCurrentItemAndCaptureResponse(page);
    expect(updateResponse.ok()).toBeTruthy();
    const updatePayload = (await updateResponse.json()) as { financial_impact?: number; id?: string };
    if (typeof updatePayload.id === "string") {
      registerCountLineId(business.scope, updatePayload.id);
    }
    expect(updatePayload.financial_impact).toBe(20);

    await openStaffHistory(page, sessionId);
    const updatedState = await assertHistoryMatchesBackend(page, business, item.item_code);
    expectSingleBackendCountLine(updatedState.inspection);
    expect(updatedState.backend.counted).toBe(7);
    expect(updatedState.backend.variance).toBe(2);
    expect(updatedState.backend.financialImpact).toBe(20);
    expect(updatedState.backend.status.toUpperCase()).toBe("PENDING");
  });

  test("completed recount clears the rejected state and updates the session line", async ({
    browser,
    business,
    page,
  }) => {
    test.setTimeout(240000);

    const rackMarker = makeSyntheticMarker("recount", business.testRunId);
    const item = makeSyntheticErpItem("recount", business.scope, {
      floor: "Showroom - Ground Floor",
      rack: rackMarker,
      stock_qty: 5,
    });
    const supervisorContext = await createAuthenticatedBrowserContext(
      browser,
      AUTH_STATE_FILES.supervisor,
    );

    try {
      await createSyntheticErpItem(business.adminContext, business.scope, item);

      const sessionId = await createSessionFromStaffHome(page, rackMarker);
      registerSessionId(business.scope, sessionId);

      await searchAndOpenItem(page, item.barcode);
      await fillCurrentItemCount(page, {
        quantity: 7,
        varianceReason: "E2E recount seed variance",
      });
      await submitCurrentItemAndWaitForScan(page);

      const preRejectInspection = await inspectBusinessState(business);
      expectSingleBackendCountLine(preRejectInspection);

      const supervisorPage = await supervisorContext.newPage();
      await openSessionDetailAsSupervisor(supervisorPage, sessionId);
      await supervisorPage.getByTestId(`session-line-${item.item_code}-reject`).click();
      await expect(supervisorPage.getByText("Assign Recount", { exact: true })).toBeVisible({
        timeout: 10000,
      });
      await supervisorPage.getByText("Staff Member (staff1)", { exact: true }).click({
        force: true,
      });
      await supervisorPage
        .getByPlaceholder("Add recount instructions")
        .fill(`E2E recount ${rackMarker}`);
      const rejectResponsePromise = supervisorPage.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().includes("/api/count-lines/") &&
          response.url().includes("/reject"),
        { timeout: 15000 },
      );
      await supervisorPage.getByText("Assign Recount", { exact: true }).click({
        force: true,
      });
      const rejectResponse = await rejectResponsePromise;
      expect(rejectResponse.ok()).toBeTruthy();

      const rejectedState = await inspectBusinessState(business);
      expect(rejectedState.state.notifications.length).toBeGreaterThan(0);
      const rejectedBackend = readBackendCountLineMetrics(rejectedState);
      expect(rejectedBackend.status.toUpperCase()).toBe("REJECTED");
      expect(rejectedBackend.recountRequestedAt).toBeTruthy();

      await page.goto("/notifications");
      await expect(page.getByText("Notifications", { exact: true })).toBeVisible({
        timeout: 30000,
      });
      await expect(page.getByText(`E2E recount ${rackMarker}`)).toBeVisible({
        timeout: 30000,
      });
      await page.getByText("Recount Requested", { exact: true }).first().click();

      await fillCurrentItemCount(page, {
        quantity: 5,
        varianceReason: "E2E recount correction",
      });
      const recountResponse = await submitCurrentItemAndCaptureResponse(page);
      expect(recountResponse.ok()).toBeTruthy();

      await openSessionDetailAsSupervisor(supervisorPage, sessionId);
      const resolvedState = await assertSessionLineMatchesBackend(
        supervisorPage,
        business,
        item.item_code,
      );
      expectSingleBackendCountLine(resolvedState.inspection);
      expect(resolvedState.backend.counted).toBe(5);
      expect(resolvedState.backend.variance).toBe(0);
      expect(resolvedState.backend.status.toUpperCase()).not.toBe("REJECTED");
      expect(resolvedState.backend.recountRequestedAt).toBeFalsy();
      expect(resolvedState.backend.rejectedBy).toBeFalsy();
      expect(resolvedState.backend.rejectionReason).toBeFalsy();
    } finally {
      await supervisorContext.close();
    }
  });

  test("variance reporting surfaces the same discrepancy in review UI and export", async ({
    browser,
    business,
    page,
  }) => {
    test.setTimeout(240000);

    const rackMarker = makeSyntheticMarker("report", business.testRunId);
    const item = makeSyntheticErpItem("report", business.scope, {
      floor: "Showroom - Ground Floor",
      rack: rackMarker,
      stock_qty: 5,
    });
    const supervisorContext = await createAuthenticatedBrowserContext(
      browser,
      AUTH_STATE_FILES.supervisor,
    );

    try {
      await createSyntheticErpItem(business.adminContext, business.scope, item);

      const sessionId = await createSessionFromStaffHome(page, rackMarker);
      registerSessionId(business.scope, sessionId);

      await searchAndOpenItem(page, item.barcode);
      await fillCurrentItemCount(page, {
        quantity: 7,
        varianceReason: "E2E report variance",
      });
      await submitCurrentItemAndWaitForScan(page);

      const countLineState = await inspectBusinessState(business);
      const countLineBackend = readBackendCountLineMetrics(countLineState);
      expect(countLineBackend.variance).toBe(2);

      const supervisorPage = await supervisorContext.newPage();
      await supervisorPage.goto("/supervisor/variances");
      await expect(
        supervisorPage.getByText(/discrepancies found|No variances found/i),
      ).toBeVisible({ timeout: 30000 });

      const cardId = varianceCardTestId(item.item_code);
      await expect(supervisorPage.getByTestId(cardId)).toBeVisible({
        timeout: 30000,
      });

      const varianceState = await assertVarianceCardMatchesBackend(
        supervisorPage,
        business,
        item.item_code,
      );

      const exportResponsePromise = supervisorPage.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          response.url().includes("/api/v2/erp/items/variances/export/csv"),
        { timeout: 15000 },
      );
      await supervisorPage.getByTestId("variances-export-csv").click();
      const exportResponse = await exportResponsePromise;
      expect(exportResponse.ok()).toBeTruthy();

      const csvRows = parseCsv((await exportResponse.body()).toString("utf-8"));
      const exportRow = csvRows.find((row) => row.item_code === item.item_code);
      expect(exportRow).toBeTruthy();
      expect(varianceState.backend.systemQty).toBe(Number.parseFloat(exportRow!.system_qty));
      expect(varianceState.backend.verifiedQty).toBe(Number.parseFloat(exportRow!.verified_qty));
      expect(varianceState.backend.variance).toBe(Number.parseFloat(exportRow!.variance));
      expect(varianceState.backend.location).toBe(
        [exportRow!.floor, exportRow!.rack].filter(Boolean).join(" / "),
      );
    } finally {
      await supervisorContext.close();
    }
  });
});
