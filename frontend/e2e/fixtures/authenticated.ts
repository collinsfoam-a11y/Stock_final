import { test as base, expect } from "@playwright/test";

import {
  assertAuthenticated,
  getRoleHomePath,
  type Role,
} from "../helpers/auth";
import { getRoleFromProjectName, resolveAppUrl } from "../helpers/authConfig";

type AuthenticatedFixtures = {
  role: Role;
};

export const test = base.extend<AuthenticatedFixtures>({
  role: async ({}, use, testInfo) => {
    const role = getRoleFromProjectName(testInfo.project.name);
    if (!role) {
      throw new Error(
        `Authenticated fixture requires a role-based project. Received "${testInfo.project.name}".`,
      );
    }
    await use(role);
  },
});

test.beforeEach(async ({ page, role }) => {
  await page.goto(resolveAppUrl(getRoleHomePath(role)));
  await assertAuthenticated(page, role);
});

export { expect };
