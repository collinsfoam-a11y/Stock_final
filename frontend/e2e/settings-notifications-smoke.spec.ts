import { expect, test, type Page } from "@playwright/test";
import { getAuthenticatedSession, seedAuthState } from "./helpers/auth";

type Role = "staff" | "supervisor" | "admin";

type SmokeScenario = {
  name: string;
  path: string;
  role: Role;
  width: number;
  height: number;
  heading: RegExp;
};

const USE_MOCK_AUTH = process.env.E2E_MOCK_AUTH === "true";
const MOCK_ACCESS_TOKENS: Record<Role, string> = {
  staff:
    "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJtb2NrLXN0YWZmIiwicm9sZSI6InN0YWZmIiwiZXhwIjoyMDAwMDAwMDAwfQ.signature",
  supervisor:
    "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJtb2NrLXN1cGVydmlzb3IiLCJyb2xlIjoic3VwZXJ2aXNvciIsImV4cCI6MjAwMDAwMDAwMH0.signature",
  admin:
    "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJtb2NrLWFkbWluIiwicm9sZSI6ImFkbWluIiwiZXhwIjoyMDAwMDAwMDAwfQ.signature",
};

const SCENARIOS: SmokeScenario[] = [
  {
    name: "notifications staff 320",
    path: "/notifications?e2e=1",
    role: "staff",
    width: 320,
    height: 760,
    heading: /notifications/i,
  },
  {
    name: "notifications staff 390",
    path: "/notifications?e2e=1",
    role: "staff",
    width: 390,
    height: 844,
    heading: /notifications/i,
  },
  {
    name: "staff settings 320",
    path: "/staff/settings?e2e=1",
    role: "staff",
    width: 320,
    height: 760,
    heading: /settings/i,
  },
  {
    name: "staff settings 390",
    path: "/staff/settings?e2e=1",
    role: "staff",
    width: 390,
    height: 844,
    heading: /settings/i,
  },
  {
    name: "supervisor settings 390",
    path: "/supervisor/settings?e2e=1",
    role: "supervisor",
    width: 390,
    height: 844,
    heading: /settings/i,
  },
  {
    name: "admin settings 390",
    path: "/admin/settings?e2e=1",
    role: "admin",
    width: 390,
    height: 844,
    heading: /system settings/i,
  },
  {
    name: "admin settings tablet",
    path: "/admin/settings?e2e=1",
    role: "admin",
    width: 768,
    height: 1024,
    heading: /system settings/i,
  },
];

const buildMockUserSettings = () => ({
  theme: "light",
  notifications_enabled: true,
  notification_sound: true,
  notification_badge: true,
  notification_recount_alerts: true,
  notification_approval_alerts: true,
  notification_sync_failure_alerts: true,
  notification_session_reminder_alerts: true,
  auto_sync_enabled: true,
  auto_sync_interval: 15,
  sync_on_reconnect: true,
  offline_mode: false,
  cache_expiration: 24,
  max_queue_size: 1000,
  scanner_vibration: true,
  scanner_sound: true,
  scanner_auto_submit: true,
  scanner_timeout: 30,
  font_size: 16,
  font_style: "system",
  show_item_images: true,
  show_item_prices: true,
  show_item_stock: true,
  export_format: "csv",
  backup_frequency: "weekly",
  require_auth: true,
  session_timeout: 30,
  biometric_auth: false,
  operational_mode: "routine",
  image_cache: true,
  lazy_loading: true,
  debounce_delay: 300,
  column_visibility: {
    mfg_date: true,
    expiry_date: true,
    serial_number: true,
    mrp: true,
  },
  updated_at: null,
});

const buildMockSystemSettings = () => ({
  api_timeout: 30,
  api_rate_limit: 120,
  cache_enabled: true,
  cache_ttl: 300,
  cache_max_size: 1000,
  auto_sync_enabled: true,
  sync_interval: 60,
  sync_batch_size: 100,
  session_timeout: 3600,
  max_concurrent_sessions: 10,
  enable_audit_log: true,
  log_retention_days: 30,
  log_level: "INFO",
  mongo_pool_size: 10,
  sql_pool_size: 5,
  query_timeout: 30,
  password_min_length: 8,
  password_require_uppercase: true,
  password_require_lowercase: true,
  password_require_numbers: true,
  jwt_expiration: 3600,
  enable_compression: true,
  enable_cors: false,
  max_request_size: 1048576,
});

const buildMockAuth = (role: Role) => ({
  accessToken: MOCK_ACCESS_TOKENS[role],
  refreshToken: `mock-${role}-refresh-token`,
  user: {
    username: `mock-${role}`,
    full_name: `Mock ${role}`,
    has_pin: true,
    role,
  },
});

async function installMockApi(page: Page, role: Role) {
  const userSettings = buildMockUserSettings();

  await page.route(/^https?:\/\/[^/]+\/(?:api\/)?health(?:[/?#].*)?$/, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "ok" }),
    })
  );

  await page.route(/^https?:\/\/[^/]+\/api\/.*$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    const fulfillJson = (payload: unknown) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(payload),
      });

    if (pathname.endsWith("/api/user/settings")) {
      if (request.method() === "PATCH") {
        const payload = request.postDataJSON() as Record<string, unknown>;
        return fulfillJson({
          status: "success",
          message: "Settings updated successfully",
          data: { ...userSettings, ...payload },
        });
      }
      return fulfillJson({
        status: "success",
        message: "Settings retrieved successfully",
        data: userSettings,
      });
    }

    if (pathname.endsWith("/api/notifications/unread-count")) {
      return fulfillJson({ unread_count: 1 });
    }

    if (pathname.endsWith("/api/notifications")) {
      return fulfillJson({
        notifications: [
          {
            _id: "notification-1",
            type: "recount_assigned",
            title: "Recount assigned",
            message: "Rack A-12 needs supervisor recount.",
            priority: "high",
            read: false,
            created_at: "2026-05-08T08:00:00.000Z",
          },
        ],
        total: 1,
        unread_count: 1,
      });
    }

    if (pathname.endsWith("/api/admin/settings/parameters")) {
      return fulfillJson({
        success: true,
        data: buildMockSystemSettings(),
      });
    }

    if (pathname.includes("/api/auth/")) {
      return fulfillJson({
        success: true,
        data: {
          access_token: MOCK_ACCESS_TOKENS[role],
          refresh_token: `mock-${role}-refresh-token`,
          user: buildMockAuth(role).user,
        },
      });
    }

    return fulfillJson({ success: true, data: {} });
  });
}

function shouldIgnoreConsoleMessage(message: string): boolean {
  if (!USE_MOCK_AUTH) {
    return false;
  }

  return (
    message.includes("[ConnectionManager] No healthy connections found") ||
    message.includes("[ConnectionManager] Using fallback connection") ||
    message.includes("[httpClient] Ignoring unhealthy connection update") ||
    message.includes("[initApp] Background sync failed {error: Background sync timeout}") ||
    message.includes("props.pointerEvents is deprecated. Use style.pointerEvents") ||
    message.includes("Animated: `useNativeDriver` is not supported because the native animated module is missing")
  );
}

async function seedScenarioAuth(
  page: Page,
  request: Parameters<typeof getAuthenticatedSession>[0],
  role: Role
) {
  if (USE_MOCK_AUTH) {
    await installMockApi(page, role);
    await seedAuthState(page, buildMockAuth(role));
    return;
  }

  const session = await getAuthenticatedSession(request, role);
  await seedAuthState(page, {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    user: session.user,
  });
}

async function collectLayoutIssues(page: Page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const documentScrollWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth
    );
    const overflowNodes = Array.from(document.querySelectorAll("body *"))
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return {
          tag: node.tagName.toLowerCase(),
          text: (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          position: style.position,
        };
      })
      .filter((entry) => entry.width > 1 && entry.height > 1)
      .filter((entry) => entry.left < -2 || entry.right > viewportWidth + 2)
      .slice(0, 10);

    return {
      documentScrollWidth,
      hasHorizontalScroll: documentScrollWidth > viewportWidth + 2,
      overflowNodes,
      viewportWidth,
    };
  });
}

test.describe("settings and notifications visual smoke", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Layout smoke runs in Chromium with explicit viewport sizes."
  );

  for (const scenario of SCENARIOS) {
    test(scenario.name, async ({ page, request }, testInfo) => {
      const consoleMessages: string[] = [];
      const requestFailures: string[] = [];
      const pageErrors: string[] = [];

      page.on("console", (message) => {
        if (message.type() === "warning" || message.type() === "error") {
          const text = `[${message.type()}] ${message.text()}`;
          if (!shouldIgnoreConsoleMessage(text)) {
            consoleMessages.push(text);
          }
        }
      });
      page.on("requestfailed", (request) => {
        requestFailures.push(`${request.failure()?.errorText ?? "failed"} ${request.url()}`);
      });
      page.on("pageerror", (error) => {
        pageErrors.push(error.message);
      });

      await seedScenarioAuth(page, request, scenario.role);

      await page.setViewportSize({ width: scenario.width, height: scenario.height });
      await page.goto(scenario.path);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator("#root")).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(scenario.heading).first()).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(700);

      const layout = await collectLayoutIssues(page);
      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`${scenario.name}.png`, {
        body: screenshot,
        contentType: "image/png",
      });

      expect(layout.hasHorizontalScroll, JSON.stringify(layout, null, 2)).toBe(false);
      expect(layout.overflowNodes, JSON.stringify(layout, null, 2)).toEqual([]);
      expect(consoleMessages).toEqual([]);
      expect(requestFailures).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  }
});
