import { test, expect, type Page } from "@playwright/test";
import { ensurePinForRole, getAuthenticatedSession, seedAuthState } from "./helpers/auth";

const BACKEND_BASE_URL = process.env.E2E_BACKEND_URL || "http://localhost:8001";

type Role = "staff" | "supervisor" | "admin";

const testUsersByRole: Record<
  Role,
  {
    id: string;
    username: string;
    full_name: string;
    role: Role;
    is_active: boolean;
    permissions: string[];
  }
> = {
  staff: {
    id: "e2e-staff",
    username: "staff1",
    full_name: "E2E Staff",
    role: "staff",
    is_active: true,
    permissions: [],
  },
  supervisor: {
    id: "e2e-supervisor",
    username: "supervisor",
    full_name: "E2E Supervisor",
    role: "supervisor",
    is_active: true,
    permissions: [],
  },
  admin: {
    id: "e2e-admin",
    username: "admin",
    full_name: "E2E Admin",
    role: "admin",
    is_active: true,
    permissions: [],
  },
};

function base64UrlEncode(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function buildUnverifiedTestToken(): string {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  return [
    base64UrlEncode({ alg: "none", typ: "JWT" }),
    base64UrlEncode({ exp: expiresAt }),
    "e2e-signature",
  ].join(".");
}

async function seedWebAuthState(
  page: Page,
  role: Role,
  options?: {
    pendingRedirect?: string;
  }
) {
  await page.addInitScript(
    ({ authState, pendingRedirect }) => {
      window.localStorage.clear();
      window.localStorage.setItem("auth_token", authState.accessToken);
      window.localStorage.setItem("refresh_token", authState.refreshToken);
      window.localStorage.setItem("auth_user", JSON.stringify(authState.user));
      window.localStorage.setItem(
        "last_logged_user",
        JSON.stringify({
          username: authState.user.username,
          full_name: authState.user.full_name,
          has_pin: false,
        })
      );
      if (pendingRedirect) {
        window.localStorage.setItem("auth_pending_redirect", pendingRedirect);
      }
    },
    {
      authState: {
        accessToken: buildUnverifiedTestToken(),
        refreshToken: "e2e-refresh-token",
        user: testUsersByRole[role],
      },
      pendingRedirect: options?.pendingRedirect,
    }
  );
}

async function stubApiForRedirectOnly(page: Page) {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: {} }),
    });
  });
}

async function ensureCredentialsMode(page: Page) {
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible({
    timeout: 15000,
  });
}

/**
 * Authentication E2E Tests
 *
 * Uses deterministic session seeding for reliability on RN-web headless runs.
 */
test.describe("Authentication", () => {
  test.describe("Login Flow", () => {
    test("should show login page for unauthenticated users", async ({ page }) => {
      await page.goto("/login?e2e=1");
      await ensureCredentialsMode(page);
    });

    test("keeps public registration hidden by default", async ({ page }) => {
      await page.goto("/welcome?e2e=1");
      await expect(page.getByText(/^Create Account$/i)).toHaveCount(0);

      await page.goto("/register?e2e=1");
      await expect(page.getByText(/Registration is restricted/i)).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByText(/administrator before they can sign in/i)).toBeVisible();
    });

    test("captures protected deep link and redirects to login", async ({ page }) => {
      await stubApiForRedirectOnly(page);
      await page.goto("/staff/scan?sessionId=e2e-session");
      await page.waitForURL(/\/login(?:\?.*)?$/, { timeout: 20000 });
      const pendingRedirect = await page.evaluate(() =>
        window.localStorage.getItem("auth_pending_redirect")
      );
      expect(pendingRedirect).toContain("/staff/scan?sessionId=e2e-session");
    });

    test("redirects authenticated user from login to pending deep link", async ({ page }) => {
      await stubApiForRedirectOnly(page);
      await seedWebAuthState(page, "staff", {
        pendingRedirect: "/staff/history?approved=1",
      });

      await page.goto("/login?e2e=1");
      await page.waitForURL(/\/staff\/history\?approved=1(?:&.*)?$/, {
        timeout: 20000,
      });

      const pendingRedirect = await page.evaluate(() =>
        window.localStorage.getItem("auth_pending_redirect")
      );
      expect(pendingRedirect).toBeNull();
    });

    test("falls back to role home for invalid pending redirect and clears the value", async ({
      page,
    }) => {
      await stubApiForRedirectOnly(page);
      await seedWebAuthState(page, "staff", {
        pendingRedirect: "/admin/users",
      });

      await page.goto("/login?e2e=1");
      await page.waitForURL(/\/staff\/home(?:\?.*)?$/, {
        timeout: 20000,
      });

      const pendingRedirect = await page.evaluate(() =>
        window.localStorage.getItem("auth_pending_redirect")
      );
      expect(pendingRedirect).toBeNull();
    });

    test("redirects authenticated users away from cross-role protected routes", async ({
      page,
    }) => {
      await stubApiForRedirectOnly(page);
      await seedWebAuthState(page, "staff", {
        pendingRedirect: "/admin/users",
      });

      await page.goto("/admin/users");
      await page.waitForURL(/\/staff\/home(?:\?.*)?$/, {
        timeout: 20000,
      });

      const pendingRedirect = await page.evaluate(() =>
        window.localStorage.getItem("auth_pending_redirect")
      );
      expect(pendingRedirect).toBeNull();
    });

    test("clears pending redirect when password reset flow starts", async ({ page }) => {
      await stubApiForRedirectOnly(page);
      await page.addInitScript(() => {
        window.localStorage.setItem("auth_pending_redirect", "/staff/scan?sessionId=e2e-session");
      });

      await page.goto("/forgot-password");
      await expect(page.getByText(/forgot password/i)).toBeVisible({
        timeout: 15000,
      });
      await page.waitForFunction(
        () => window.localStorage.getItem("auth_pending_redirect") === null
      );
    });

    test("clears pending redirect on direct OTP reset route", async ({ page }) => {
      await stubApiForRedirectOnly(page);
      await page.addInitScript(() => {
        window.localStorage.setItem("auth_pending_redirect", "/staff/history?approved=1");
      });

      await page.goto("/otp-verification?identifier=staff1");
      await expect(page.getByText(/verification code/i)).toBeVisible({
        timeout: 15000,
      });
      await page.waitForFunction(
        () => window.localStorage.getItem("auth_pending_redirect") === null
      );
    });

    test("clears pending redirect on direct reset password route", async ({ page }) => {
      await stubApiForRedirectOnly(page);
      await page.addInitScript(() => {
        window.localStorage.setItem("auth_pending_redirect", "/staff/history?approved=1");
      });

      await page.goto("/reset-password?reset_token=e2e-reset-token");
      await expect(page.getByText(/^Set New Password$/i)).toBeVisible({
        timeout: 15000,
      });
      await page.waitForFunction(
        () => window.localStorage.getItem("auth_pending_redirect") === null
      );
    });

    test("should login successfully with valid credentials", async ({ page, request }) => {
      const session = await getAuthenticatedSession(request, "staff");
      await seedAuthState(page, {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        user: session.user,
      });

      await page.goto("/login?e2e=1");
      await page.waitForURL(/\/staff\/home(?:\?.*)?$/, { timeout: 20000 });
      await expect(page.getByText(/start new session/i)).toBeVisible({
        timeout: 15000,
      });
    });

    test("rejects invalid credentials at auth API", async ({ request }) => {
      const response = await request.post(`${BACKEND_BASE_URL}/api/auth/login`, {
        data: {
          username: "staff1",
          password: "wrongpassword",
        },
        headers: {
          "x-device-id": "playwright-invalid-login",
        },
      });

      expect(response.ok()).toBeFalsy();
      const payload = await response.json().catch(() => null);
      if (payload && typeof payload.success === "boolean") {
        expect(payload.success).toBe(false);
      }
    });
  });

  test.describe("Logout Flow", () => {
    test.beforeEach(async ({ page, request }) => {
      const session = await getAuthenticatedSession(request, "staff");
      await seedAuthState(page, {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        user: session.user,
      });
      await page.goto("/staff/home");
      await page.waitForURL(/\/staff\/home(?:\?.*)?$/, { timeout: 20000 });
    });

    test("should logout successfully", async ({ page }) => {
      await page.goto("/staff/settings");
      await page.waitForURL(/\/staff\/settings(?:\?.*)?$/, { timeout: 20000 });

      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByText(/^sign out$/i)
        .first()
        .click();
      await page.waitForURL(/\/welcome(?:\?.*)?$/, { timeout: 20000 });

      const authToken = await page.evaluate(() => window.localStorage.getItem("auth_token"));
      const authUser = await page.evaluate(() => window.localStorage.getItem("auth_user"));
      expect(authToken).toBeNull();
      expect(authUser).toBeNull();
    });
  });

  test.describe("Session Persistence", () => {
    test("should maintain session after page refresh", async ({ page, request }) => {
      const session = await getAuthenticatedSession(request, "staff");
      await seedAuthState(page, {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        user: session.user,
      });

      await page.goto("/staff/home");
      await page.waitForURL(/\/staff\/home(?:\?.*)?$/, { timeout: 20000 });
      await expect(page.getByText(/start new session/i)).toBeVisible({
        timeout: 15000,
      });

      await page.reload();
      await page.waitForURL(/\/staff\/home(?:\?.*)?$/, { timeout: 20000 });
      await expect(page.getByText(/start new session/i)).toBeVisible({
        timeout: 15000,
      });

      await expect(page.getByRole("button", { name: /^sign in$/i })).toHaveCount(0);
    });
  });
});

test.describe("PIN Authentication", () => {
  test("should login successfully with API PIN auth after PIN setup", async ({ request }) => {
    const pin = "8520";
    await ensurePinForRole(request, "staff", pin);

    const response = await request.post(`${BACKEND_BASE_URL}/api/auth/login-pin`, {
      data: {
        username: "staff1",
        pin,
      },
      headers: {
        "x-device-id": "playwright-pin-auth",
      },
    });

    expect(response.ok()).toBeTruthy();
    const payload = await response.json().catch(() => null);
    expect(payload?.success).toBe(true);
    expect(payload?.data?.access_token).toBeTruthy();
    expect(payload?.data?.user?.role).toBe("staff");
  });
});
