import fs from "node:fs/promises";

import { test as setup } from "@playwright/test";

import {
  AUTH_ROLES,
  AUTH_STATE_FILES,
  ensureAuthStateDir,
  validateRoleAuthState,
  writeRoleAuthState,
} from "../e2e/helpers/auth";

setup.describe.configure({ mode: "serial" });

setup("generate storageState for authenticated roles", async ({
  browser,
}) => {
  await ensureAuthStateDir();

  for (const role of AUTH_ROLES) {
    try {
      await fs.rm(AUTH_STATE_FILES[role], { force: true });
      await writeRoleAuthState(browser, role);
      await validateRoleAuthState(browser, role);
    } catch (error) {
      console.error(`[auth.setup] Failed to generate ${role} storageState`, error);
      throw error;
    }
  }
});
