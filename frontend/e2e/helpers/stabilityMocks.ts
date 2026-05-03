import type { Page, Route } from "@playwright/test";

type StabilityMockOptions = {
  syncConflicts?: boolean;
  recountEdgeCases?: boolean;
  offlineTransitions?: boolean;
};

const fulfillJson = (route: Route, payload: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });

export async function installStabilityMocks(
  page: Page,
  options: StabilityMockOptions = {},
): Promise<void> {
  const {
    syncConflicts = true,
    recountEdgeCases = true,
    offlineTransitions = true,
  } = options;

  if (syncConflicts) {
    await page.route("**/api/sync/conflicts/stats/summary", (route) =>
      fulfillJson(route, {
        success: true,
        data: {
          pending: 0,
          resolved: 0,
          ignored: 0,
          total: 0,
        },
      }),
    );
  }

  if (recountEdgeCases) {
    await page.route("**/api/recount/stats/summary", (route) =>
      fulfillJson(route, {
        success: true,
        total: 0,
        by_status: {},
        by_priority: {},
        overdue: 0,
      }),
    );
  }

  if (offlineTransitions) {
    await page.route(/\/api\/sessions\/offline_[^/]+\/stats$/, (route) =>
      fulfillJson(route, {
        id: "offline_session",
        total_items: 0,
        verified_items: 0,
        pending_items: 0,
        damage_items: 0,
        duration_seconds: 0,
        items_per_minute: 0,
      }),
    );
  }
}
