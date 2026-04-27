import { expect, type Page } from "@playwright/test";

import { ROLE_HOME_PATHS, resolveAppUrl, type Role } from "./authConfig";

type Credentials = {
  password: string;
  username: string;
};

export async function gotoLogin(page: Page) {
  await page.goto(resolveAppUrl("/login?e2e=1"));

  const usernameInput = page.getByTestId("login-username");
  const credentialsToggle = page.getByTestId("login-mode-credentials");
  const hasDirectLoginUi =
    (await usernameInput.isVisible({ timeout: 1000 }).catch(() => false)) ||
    (await credentialsToggle.isVisible({ timeout: 1000 }).catch(() => false));

  if (!hasDirectLoginUi) {
    const signInButton = page.getByRole("button", { name: "Sign In" });
    if (await signInButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await signInButton.click();
    }
  }

  await ensureCredentialsMode(page);
}

export async function ensureCredentialsMode(page: Page) {
  const usernameInput = page.getByTestId("login-username");
  const credentialsToggle = page.getByTestId("login-mode-credentials");

  await Promise.any([
    usernameInput.waitFor({ state: "visible", timeout: 10000 }),
    credentialsToggle.waitFor({ state: "visible", timeout: 10000 }),
  ]).catch(() => undefined);

  if (await usernameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    return;
  }

  await expect(credentialsToggle).toBeVisible({ timeout: 10000 });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await credentialsToggle.click();
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
    }

    if (await usernameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      return;
    }
  }

  await expect(usernameInput).toBeVisible({ timeout: 10000 });
}

export async function loginThroughUi(
  page: Page,
  credentials: Credentials,
  expectedRole?: Role,
) {
  await gotoLogin(page);

  await page.getByTestId("login-username").fill(credentials.username);
  await page.getByTestId("login-password").fill(credentials.password);
  await page.getByTestId("login-submit").click();

  if (expectedRole) {
    await expect(page).toHaveURL(
      new RegExp(
        ROLE_HOME_PATHS[expectedRole].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      ),
    );
  }
}
