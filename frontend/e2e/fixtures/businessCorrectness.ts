import type { APIRequestContext } from "@playwright/test";

import { createRoleApiContext } from "../helpers/auth";
import {
  cleanupSyntheticFixtures,
  createFixtureScope,
  scopeRuntimeFixtures,
  type FixtureScope,
} from "../helpers/businessFixtures";
import { expect, test as authenticatedTest } from "./authenticated";

export type BusinessScope = {
  adminContext: APIRequestContext;
  scope: FixtureScope;
  testRunId: string;
};

export const test = authenticatedTest.extend<{ business: BusinessScope }>({
  business: async ({ page, playwright }, use, testInfo) => {
    const scope = createFixtureScope(testInfo);
    const adminContext = await createRoleApiContext(
      playwright,
      "admin",
      `playwright-admin-${scope.testRunId}`,
    );

    try {
      await use({
        adminContext,
        scope,
        testRunId: scope.testRunId,
      });
    } finally {
      await page.context().setOffline(false).catch(() => undefined);
      await scopeRuntimeFixtures(adminContext, scope).catch(() => undefined);
      await cleanupSyntheticFixtures(adminContext, scope).catch(() => undefined);
      await adminContext.dispose();
    }
  },
});

export { expect };
