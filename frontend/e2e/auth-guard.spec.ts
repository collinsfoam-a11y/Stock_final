import { test, expect } from "@playwright/test";

import {
  AUTH_STATE_FILES,
  createAuthenticatedBrowserContext,
  createRoleApiContext,
} from "./helpers/auth";
import { resolveAppUrl } from "./helpers/authConfig";

test.describe("Authentication guard", () => {
  test("stale browser session on scan redirects cleanly without retry storms", async ({
    browser,
    playwright,
  }) => {
    const apiContext = await createRoleApiContext(
      playwright,
      "staff",
      "playwright-staff-auth-guard",
    );

    let createdSessionId = "";

    try {
      const sessionResponse = await apiContext.post("/api/sessions/", {
        data: {
          warehouse: `stale-auth-${Date.now()}`,
          type: "STANDARD",
        },
      });
      expect(sessionResponse.ok()).toBeTruthy();
      const payload = (await sessionResponse.json()) as { id: string };
      createdSessionId = payload.id;
    } finally {
      await apiContext.dispose();
    }

    const staleContext = await createAuthenticatedBrowserContext(
      browser,
      AUTH_STATE_FILES.staff,
    );

    try {
      await staleContext.clearCookies();
      const page = await staleContext.newPage();

      const statsResponses: string[] = [];
      const refreshResponses: string[] = [];
      const websocketAttempts: string[] = [];

      page.on("response", (response) => {
        const url = response.url();
        if (url.includes(`/api/sessions/${createdSessionId}/stats`)) {
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

      await page.goto(
        resolveAppUrl(
          `/staff/scan?sessionId=${encodeURIComponent(createdSessionId)}`,
        ),
      );

      await page.waitForURL(/\/welcome(?:\?.*)?$/, { timeout: 20000 });
      await expect(page.getByText("Start a session")).toBeVisible({
        timeout: 10000,
      });

      expect(statsResponses.length).toBeLessThanOrEqual(2);
      expect(refreshResponses.length).toBeLessThanOrEqual(1);
      expect(websocketAttempts.length).toBeLessThanOrEqual(1);
    } finally {
      await staleContext.close();
    }
  });
});
