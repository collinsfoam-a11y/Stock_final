import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

const BACKEND_BASE_URL = process.env.E2E_BACKEND_URL || "http://127.0.0.1:8001";

type AuthUser = {
  id: string;
  username: string;
  full_name: string;
  role: "staff" | "supervisor" | "admin";
  is_active: boolean;
  permissions: string[];
  has_pin?: boolean;
};

type LoginResponse = {
  success: boolean;
  data: {
    access_token: string;
    refresh_token: string;
    user: AuthUser;
  };
};

type ERPItemsResponse = {
  items: Array<{
    item_code: string;
    item_name: string;
    barcode?: string;
    warehouse?: string;
    stock_qty?: number;
  }>;
};

type SessionResponse = {
  id: string;
};

type CountLineResponse = {
  id: string;
};

async function apiJson<T>(
  request: APIRequestContext,
  method: "GET" | "POST" | "PUT",
  path: string,
  options: {
    token?: string;
    data?: unknown;
  } = {},
): Promise<T> {
  const response = await request.fetch(`${BACKEND_BASE_URL}${path}`, {
    method,
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.data ? { "Content-Type": "application/json" } : {}),
    },
    data: options.data,
  });

  const body = await response.text();
  if (!response.ok()) {
    throw new Error(`${method} ${path} failed: ${response.status()} ${body}`);
  }

  return JSON.parse(body) as T;
}

async function login(
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<LoginResponse["data"]> {
  const payload = await apiJson<LoginResponse>(request, "POST", "/api/auth/login", {
    data: { username, password },
  });
  return payload.data;
}

async function primeAuthStorage(context: BrowserContext, auth: LoginResponse["data"]) {
  await context.addInitScript((payload) => {
    localStorage.setItem("auth_token", payload.accessToken);
    localStorage.setItem("refresh_token", payload.refreshToken);
    localStorage.setItem("auth_user", JSON.stringify(payload.user));
    localStorage.setItem(
      "last_logged_user",
      JSON.stringify({
        username: payload.user.username,
        full_name: payload.user.full_name,
        has_pin: payload.user.has_pin,
      }),
    );
  }, {
    accessToken: auth.access_token,
    refreshToken: auth.refresh_token,
    user: auth.user,
  });
}

test.describe("Recount Assignment UI", () => {
  test("supervisor can assign recount and assignee can open it from notifications", async ({
    browser,
    request,
  }, testInfo) => {
    test.setTimeout(180000);

    const projectSlug = testInfo.project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 12);
    const suffix = `${projectSlug}_${Date.now().toString(36)}_${testInfo.parallelIndex}`;
    const ownerUsername = `ui_owner_${suffix}`;
    const assigneeUsername = `ui_assignee_${suffix}`;
    const sharedPassword = "SmokePass123!";
    const ownerFullName = `UI Owner ${suffix}`;
    const assigneeFullName = `UI Assignee ${suffix}`;

    const adminAuth = await login(request, "admin", "admin123");
    const supervisorAuth = await login(request, "supervisor", "super123");

    for (const user of [
      { username: ownerUsername, fullName: ownerFullName },
      { username: assigneeUsername, fullName: assigneeFullName },
    ]) {
      await apiJson(request, "POST", "/api/users", {
        token: adminAuth.access_token,
        data: {
          username: user.username,
          password: sharedPassword,
          pin: "1234",
          role: "staff",
          full_name: user.fullName,
        },
      });
    }

    const ownerAuth = await login(request, ownerUsername, sharedPassword);
    const assigneeAuth = await login(request, assigneeUsername, sharedPassword);

    const erpItems = await apiJson<ERPItemsResponse>(request, "GET", "/api/erp/items?page=1&page_size=20", {
      token: ownerAuth.access_token,
    });
    const erpItem = erpItems.items.find((item) => item.barcode && item.warehouse);
    if (!erpItem?.barcode || !erpItem.warehouse) {
      throw new Error("Expected at least one ERP item with barcode and warehouse");
    }

    const session = await apiJson<SessionResponse>(request, "POST", "/api/sessions/", {
      token: ownerAuth.access_token,
      data: {
        warehouse: erpItem.warehouse,
        type: "STANDARD",
      },
    });

    const countLine = await apiJson<CountLineResponse>(request, "POST", "/api/count-lines", {
      token: ownerAuth.access_token,
      data: {
        session_id: session.id,
        item_code: erpItem.item_code,
        barcode: erpItem.barcode,
        counted_qty: (erpItem.stock_qty ?? 0) + 1,
        variance_reason: `ui-smoke-${suffix}`,
        remark: "Playwright recount assignment smoke",
      },
    });

    const supervisorContext = await browser.newContext();
    await primeAuthStorage(supervisorContext, supervisorAuth);
    const supervisorPage = await supervisorContext.newPage();

    await supervisorPage.goto(`/supervisor/session/${encodeURIComponent(session.id)}`);
    await expect(supervisorPage.getByText("Session Details")).toBeVisible({ timeout: 30000 });
    await expect(supervisorPage.getByText(erpItem.item_name)).toBeVisible({ timeout: 30000 });

    await supervisorPage.getByText("Reject", { exact: true }).first().click();
    await expect(supervisorPage.getByText("Assign Recount", { exact: true })).toBeVisible({
      timeout: 10000,
    });

    await supervisorPage
      .getByText(`${ownerFullName} (${ownerUsername})`, { exact: true })
      .click({ force: true });
    await supervisorPage.getByTestId("recount-assignee-picker-search").fill(assigneeUsername);
    await supervisorPage
      .getByText(`${assigneeFullName} (${assigneeUsername})`, { exact: true })
      .click();
    await supervisorPage.getByPlaceholder("Add recount instructions").fill("Smoke recount assignment");

    const rejectResponsePromise = supervisorPage.waitForResponse(
      (response) => {
        return (
          response.request().method() === "PUT" &&
          response.url().includes(`/api/count-lines/${countLine.id}/reject`)
        );
      },
      { timeout: 15000 },
    );

    await supervisorPage
      .getByText("Assign Recount", { exact: true })
      .click({ force: true });

    const rejectResponse = await rejectResponsePromise;
    expect(rejectResponse.ok()).toBeTruthy();
    await expect(supervisorPage.getByText("REJECTED", { exact: true })).toBeVisible({
      timeout: 15000,
    });

    const assigneeContext = await browser.newContext();
    await primeAuthStorage(assigneeContext, assigneeAuth);
    const assigneePage = await assigneeContext.newPage();

    await assigneePage.goto("/notifications");
    await expect(assigneePage.getByText("Notifications")).toBeVisible({ timeout: 30000 });
    await expect(assigneePage.getByText("Recount Requested", { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(assigneePage.getByText("Smoke recount assignment")).toBeVisible({
      timeout: 30000,
    });

    await assigneePage.getByText("Recount Requested", { exact: true }).first().click();
    await assigneePage.waitForURL("**/staff/item-detail?**", { timeout: 30000 });
    await expect(assigneePage.getByText("Verify Item", { exact: true })).toBeVisible({
      timeout: 30000,
    });

    const detailUrl = new URL(assigneePage.url());
    expect(detailUrl.searchParams.get("sessionId")).toBe(session.id);
    expect(detailUrl.searchParams.get("barcode")).toBe(erpItem.barcode);

    await supervisorContext.close();
    await assigneeContext.close();
  });
});
