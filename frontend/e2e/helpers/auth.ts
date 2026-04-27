import fs from "node:fs/promises";

import {
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import {
  AUTH_ROLES,
  AUTH_STATE_DIR,
  AUTH_STATE_FILES,
  BACKEND_BASE_URL,
  ROLE_CREDENTIAL_ENV,
  ROLE_HOME_PATHS,
  ROLE_PATH_PREFIXES,
  type Role,
  resolveAppUrl,
} from "./authConfig";
import { loginThroughUi } from "./loginPage";

type Credentials = {
  password: string;
  username: string;
};

type PlaywrightFacade = {
  request: {
    newContext: typeof playwrightRequest.newContext;
  };
};

type LoginResponse = {
  data?: {
    user?: {
      role?: Role;
      username?: string;
    };
  };
  success?: boolean;
};

type PublicSessionResponse = {
  data?: {
    status?: "authenticated" | "guest";
    user?: {
      role?: Role;
      username?: string;
    } | null;
  };
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildClientHeaders = (clientId: string): Record<string, string> => ({
  "x-device-id": clientId,
});

const parseJson = <T>(payload: string, context: string): T => {
  try {
    return JSON.parse(payload) as T;
  } catch (error) {
    throw new Error(
      `${context} returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

const requireEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required Playwright auth environment variable ${name}.`,
    );
  }
  return value;
};

const waitForRoleReady = async (page: Page, role: Role) => {
  switch (role) {
    case "staff":
      await expect(
        page.getByText("Start New Session", { exact: true }),
      ).toBeVisible({ timeout: 30000 });
      return;
    case "supervisor":
      await expect(
        page.getByText("Create session", { exact: true }),
      ).toBeVisible({ timeout: 30000 });
      return;
    case "admin":
      await expect(page.getByTestId("overview-panel")).toBeVisible({
        timeout: 30000,
      });
      return;
  }
};

const loginApiContextForCredentials = async (
  playwright: PlaywrightFacade,
  credentials: Credentials,
  options?: {
    clientId?: string;
    expectedRole?: Role;
  },
): Promise<APIRequestContext> => {
  const requestContext = await playwright.request.newContext({
    baseURL: BACKEND_BASE_URL,
    extraHTTPHeaders: buildClientHeaders(
      options?.clientId || `playwright-auth-${Date.now()}`,
    ),
    ignoreHTTPSErrors: true,
  });

  const disposeWithError = async (message: string) => {
    await requestContext.dispose();
    throw new Error(message);
  };

  const loginResponse = await requestContext.post("/api/auth/login", {
    data: credentials,
  });
  const loginText = await loginResponse.text();
  if (!loginResponse.ok()) {
    await disposeWithError(
      `Auth login failed (${loginResponse.status()}): ${loginText}`,
    );
  }

  const loginPayload = parseJson<LoginResponse>(loginText, "Auth login");
  const loggedInUser = loginPayload.data?.user;
  if (!loginPayload.success || !loggedInUser?.username) {
    await disposeWithError(
      `Auth login returned unsuccessful payload: ${loginText}`,
    );
  }
  const authenticatedUser = loggedInUser!;

  if (
    options?.expectedRole &&
    authenticatedUser.role !== options.expectedRole
  ) {
    await disposeWithError(
      `Auth login resolved role ${authenticatedUser.role ?? "unknown"} for ${authenticatedUser.username}; expected ${options.expectedRole}.`,
    );
  }

  const publicSessionResponse = await requestContext.get("/api/auth/public-session");
  const publicSessionText = await publicSessionResponse.text();
  if (!publicSessionResponse.ok()) {
    await disposeWithError(
      `Public session probe failed (${publicSessionResponse.status()}): ${publicSessionText}`,
    );
  }

  const publicSessionPayload = parseJson<PublicSessionResponse>(
    publicSessionText,
    "Public session probe",
  );

  if (publicSessionPayload.data?.status !== "authenticated") {
    await disposeWithError(
      `Public session probe did not establish an authenticated API session: ${publicSessionText}`,
    );
  }

  return requestContext;
};

export { AUTH_ROLES, AUTH_STATE_DIR, AUTH_STATE_FILES, type Role };

export const getRoleCredentials = (role: Role): Credentials => {
  const vars = ROLE_CREDENTIAL_ENV[role];
  return {
    username: requireEnv(vars.username),
    password: requireEnv(vars.password),
  };
};

export const getRoleHomePath = (role: Role) => ROLE_HOME_PATHS[role];

export const makeTempAuthStatePath = (outputDir: string, label: string) =>
  `${outputDir}/${label.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}.json`;

export const ensureAuthStateDir = async () => {
  await fs.mkdir(AUTH_STATE_DIR, { recursive: true });
};

export async function writeAuthStateForCredentials(
  browser: Browser,
  credentials: Credentials,
  storageStatePath: string,
  options?: {
    expectedRole?: Role;
  },
): Promise<void> {
  await ensureAuthStateDir();

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });

  try {
    const page = await context.newPage();
    await loginThroughUi(page, credentials, options?.expectedRole);

    if (options?.expectedRole) {
      await assertAuthenticated(page, options.expectedRole, {
        expectedPath: new RegExp(
          escapeRegExp(resolveAppUrl(getRoleHomePath(options.expectedRole))),
        ),
      });
      await waitForRoleReady(page, options.expectedRole);
    }

    await context.storageState({ path: storageStatePath });
  } finally {
    await context.close();
  }
}

export const writeRoleAuthState = async (browser: Browser, role: Role) =>
  writeAuthStateForCredentials(browser, getRoleCredentials(role), AUTH_STATE_FILES[role], {
    expectedRole: role,
  });

export async function assertAuthenticated(
  page: Page,
  role: Role,
  options?: {
    expectedPath?: RegExp | string;
  },
) {
  await expect(page).not.toHaveURL(/\/(?:login|welcome)(?:\?.*)?$/);
  if (options?.expectedPath) {
    await expect(page).toHaveURL(options.expectedPath);
  } else {
    const pathname = new URL(page.url()).pathname;
    if (
      pathname.startsWith("/staff") ||
      pathname.startsWith("/supervisor") ||
      pathname.startsWith("/admin")
    ) {
      await expect(page).toHaveURL(
        new RegExp(escapeRegExp(ROLE_PATH_PREFIXES[role])),
      );
    }
  }
  await expect(page.getByTestId("login-submit")).toHaveCount(0);
}

export async function validateRoleAuthState(
  browser: Browser,
  role: Role,
  storageStatePath = AUTH_STATE_FILES[role],
): Promise<void> {
  const context = await browser.newContext({ storageState: storageStatePath });
  try {
    const page = await context.newPage();
    await page.goto(resolveAppUrl(getRoleHomePath(role)));
    await assertAuthenticated(page, role, {
      expectedPath: new RegExp(escapeRegExp(resolveAppUrl(getRoleHomePath(role)))),
    });
    await waitForRoleReady(page, role);
    await context.storageState({ path: storageStatePath });
  } finally {
    await context.close();
  }
}

export const createAuthenticatedApiContext = (
  playwright: PlaywrightFacade,
  credentials: Credentials,
  clientId: string,
): Promise<APIRequestContext> =>
  loginApiContextForCredentials(playwright, credentials, { clientId });

export const createRoleApiContext = (
  playwright: PlaywrightFacade,
  role: Role,
  clientId = `playwright-${role}-${Date.now()}`,
) =>
  createAuthenticatedApiContext(playwright, getRoleCredentials(role), clientId);

export const createAuthenticatedBrowserContext = (
  browser: Browser,
  storageStatePath: string,
): Promise<BrowserContext> =>
  browser.newContext({ storageState: storageStatePath });
