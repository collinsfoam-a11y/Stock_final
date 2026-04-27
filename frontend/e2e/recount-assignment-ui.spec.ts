import {
  test,
  expect,
} from "./fixtures/authenticated";

import {
  AUTH_STATE_FILES,
  assertAuthenticated,
  createAuthenticatedBrowserContext,
  createRoleApiContext,
  makeTempAuthStatePath,
  writeAuthStateForCredentials,
} from "./helpers/auth";

type ERPItemsResponse = {
  items: Array<{
    barcode?: string;
    item_code: string;
    item_name: string;
    stock_qty?: number;
    warehouse?: string;
  }>;
};

type SessionResponse = {
  id: string;
};

type CountLineResponse = {
  id: string;
};

async function apiJson<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  context: Awaited<ReturnType<typeof createRoleApiContext>>,
  data?: unknown,
): Promise<T> {
  const response =
    method === "GET"
      ? await context.get(path)
      : method === "POST"
        ? await context.post(path, data ? { data } : undefined)
        : method === "PUT"
          ? await context.put(path, data ? { data } : undefined)
          : await context.delete(path);

  const body = await response.text();
  if (!response.ok()) {
    throw new Error(`${method} ${path} failed: ${response.status()} ${body}`);
  }

  return JSON.parse(body) as T;
}

async function cleanupUser(
  adminContext: Awaited<ReturnType<typeof createRoleApiContext>>,
  username: string,
) {
  const listPayload = await apiJson<{
    users?: Array<{ id: string; username: string }>;
  }>(
    "GET",
    `/api/users?search=${encodeURIComponent(username)}&page=1&page_size=100`,
    adminContext,
  );

  const matches = (listPayload.users || []).filter(
    (user) => user.username === username,
  );

  for (const user of matches) {
    await apiJson("DELETE", `/api/users/${user.id}`, adminContext);
  }
}

test.describe("Recount Assignment UI", () => {
  test("supervisor can assign recount and assignee can open it from notifications", async ({
    browser,
    playwright,
  }, testInfo) => {
    test.setTimeout(180000);

    const suffix = `${testInfo.parallelIndex}_${Date.now().toString(36)}`;
    const assigneeUsername = `ui_assignee_${suffix}`;
    const assigneePassword = "SmokePass123!";
    const assigneeFullName = `UI Assignee ${suffix}`;
    const assigneeAuthStatePath = makeTempAuthStatePath(
      testInfo.outputDir,
      `assignee-${suffix}`,
    );

    const adminContext = await createRoleApiContext(
      playwright,
      "admin",
      `playwright-admin-${suffix}`,
    );
    const ownerContext = await createRoleApiContext(
      playwright,
      "staff",
      `playwright-staff-${suffix}`,
    );

    try {
      await apiJson("POST", "/api/users", adminContext, {
        username: assigneeUsername,
        password: assigneePassword,
        pin: "1234",
        role: "staff",
        full_name: assigneeFullName,
      });

      await writeAuthStateForCredentials(
        browser,
        {
          username: assigneeUsername,
          password: assigneePassword,
        },
        assigneeAuthStatePath,
        {
          expectedRole: "staff",
        },
      );

      const erpItems = await apiJson<ERPItemsResponse>(
        "GET",
        "/api/erp/items?page=1&page_size=20",
        ownerContext,
      );
      const erpItem = erpItems.items.find((item) => item.barcode && item.warehouse);
      expect(erpItem?.barcode).toBeTruthy();
      expect(erpItem?.warehouse).toBeTruthy();

      const session = await apiJson<SessionResponse>(
        "POST",
        "/api/sessions/",
        ownerContext,
        {
          warehouse: erpItem!.warehouse,
          type: "STANDARD",
        },
      );

      const countLine = await apiJson<CountLineResponse>(
        "POST",
        "/api/count-lines",
        ownerContext,
        {
          session_id: session.id,
          item_code: erpItem!.item_code,
          barcode: erpItem!.barcode,
          counted_qty: (erpItem!.stock_qty ?? 0) + 1,
          variance_reason: `ui-smoke-${suffix}`,
          remark: "Playwright recount assignment smoke",
        },
      );

      const supervisorContext = await createAuthenticatedBrowserContext(
        browser,
        AUTH_STATE_FILES.supervisor,
      );
      const assigneeContext = await createAuthenticatedBrowserContext(
        browser,
        assigneeAuthStatePath,
      );

      try {
        const supervisorPage = await supervisorContext.newPage();
        await supervisorPage.goto(`/supervisor/session/${encodeURIComponent(session.id)}`);
        await assertAuthenticated(supervisorPage, "supervisor");
        await expect(
          supervisorPage.getByText("Session Details"),
        ).toBeVisible({ timeout: 30000 });
        await expect(
          supervisorPage.getByText(erpItem!.item_name),
        ).toBeVisible({ timeout: 30000 });

        await supervisorPage.getByText("Reject", { exact: true }).first().click();
        await expect(
          supervisorPage.getByText("Assign Recount", { exact: true }),
        ).toBeVisible({
          timeout: 10000,
        });

        await supervisorPage
          .getByText("Staff Member (staff1)", { exact: true })
          .click({ force: true });
        await supervisorPage
          .getByTestId("recount-assignee-picker-search")
          .fill(assigneeUsername);
        await supervisorPage
          .getByText(`${assigneeFullName} (${assigneeUsername})`, {
            exact: true,
          })
          .click();
        await supervisorPage
          .getByPlaceholder("Add recount instructions")
          .fill("Smoke recount assignment");

        const rejectResponsePromise = supervisorPage.waitForResponse(
          (response) =>
            response.request().method() === "PUT" &&
            response.url().includes(`/api/count-lines/${countLine.id}/reject`),
          { timeout: 15000 },
        );

        await supervisorPage
          .getByText("Assign Recount", { exact: true })
          .click({ force: true });

        const rejectResponse = await rejectResponsePromise;
        expect(rejectResponse.ok()).toBeTruthy();
        await expect(
          supervisorPage.getByText("REJECTED", { exact: true }),
        ).toBeVisible({
          timeout: 15000,
        });

        const assigneePage = await assigneeContext.newPage();
        await assigneePage.goto("/notifications");
        await assertAuthenticated(assigneePage, "staff");
        await expect(
          assigneePage.getByText("Notifications", { exact: true }),
        ).toBeVisible({
          timeout: 30000,
        });
        await expect(
          assigneePage.getByText("Recount Requested", { exact: true }),
        ).toBeVisible({
          timeout: 30000,
        });
        await expect(
          assigneePage.getByText("Smoke recount assignment"),
        ).toBeVisible({
          timeout: 30000,
        });

        await assigneePage
          .getByText("Recount Requested", { exact: true })
          .first()
          .click();
        await assigneePage.waitForURL("**/staff/item-detail?**", {
          timeout: 30000,
        });
        await expect(
          assigneePage.getByText("Verify Item", { exact: true }),
        ).toBeVisible({
          timeout: 30000,
        });

        const detailUrl = new URL(assigneePage.url());
        expect(detailUrl.searchParams.get("sessionId")).toBe(session.id);
        expect(detailUrl.searchParams.get("barcode")).toBe(erpItem!.barcode);
      } finally {
        await supervisorContext.close();
        await assigneeContext.close();
      }
    } finally {
      await cleanupUser(adminContext, assigneeUsername).catch(() => {});
      await adminContext.dispose();
      await ownerContext.dispose();
    }
  });
});
