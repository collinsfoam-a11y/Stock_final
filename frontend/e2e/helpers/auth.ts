import { expect, type APIRequestContext, type Page } from "@playwright/test";

type Role = "staff" | "supervisor" | "admin";

type LoginResponse = {
  success: boolean;
  data: {
    access_token: string;
    refresh_token?: string;
    user: {
      username: string;
      full_name: string;
      has_pin?: boolean;
      role: Role;
    };
  };
};

type AuthSession = LoginResponse["data"];

const BACKEND_BASE_URL =
  process.env.E2E_BACKEND_URL || "http://localhost:8001";

const credentialsByRole: Record<Role, { username: string; password: string }> = {
  staff: { username: "staff1", password: "staff123" },
  supervisor: { username: "supervisor", password: "super123" },
  admin: { username: "admin", password: "admin123" },
};

const SESSION_TTL_MS = 5 * 60 * 1000;
const sessionCache = new Map<Role, { session: AuthSession; cachedAt: number }>();

function buildClientHeaders(clientId: string): Record<string, string> {
  return {
    "x-device-id": clientId,
  };
}

export async function getAuthenticatedSession(
  request: APIRequestContext,
  role: Role,
): Promise<AuthSession> {
  const cached = sessionCache.get(role);
  if (cached && Date.now() - cached.cachedAt < SESSION_TTL_MS) {
    return cached.session;
  }

  const credentials = credentialsByRole[role];
  const response = await request.post(`${BACKEND_BASE_URL}/api/auth/login`, {
    data: credentials,
    headers: buildClientHeaders(`playwright-${role}`),
  });

  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as LoginResponse;
  expect(payload.success).toBeTruthy();
  expect(payload.data.user.role).toBe(role);

  sessionCache.set(role, {
    session: payload.data,
    cachedAt: Date.now(),
  });

  return payload.data;
}

export async function seedAuthState(
  page: Page,
  auth: {
    accessToken: string;
    refreshToken?: string;
    user: AuthSession["user"];
  },
  options?: {
    clearRefreshToken?: boolean;
  },
): Promise<void> {
  await page.addInitScript(
    ({ authState, clearRefreshToken }) => {
      window.localStorage.clear();
      window.localStorage.setItem("auth_token", authState.accessToken);
      if (authState.refreshToken && !clearRefreshToken) {
        window.localStorage.setItem("refresh_token", authState.refreshToken);
      }
      window.localStorage.setItem("auth_user", JSON.stringify(authState.user));
      window.localStorage.setItem(
        "last_logged_user",
        JSON.stringify({
          username: authState.user.username,
          full_name: authState.user.full_name,
          has_pin: authState.user.has_pin,
        }),
      );
      if (clearRefreshToken) {
        window.localStorage.removeItem("refresh_token");
      }
    },
    {
      authState: auth,
      clearRefreshToken: options?.clearRefreshToken ?? false,
    },
  );
}

export async function authenticateAs(
  page: Page,
  request: APIRequestContext,
  role: Role,
): Promise<void> {
  const session = await getAuthenticatedSession(request, role);
  await seedAuthState(page, {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    user: session.user,
  });
}

export async function createSessionAs(
  request: APIRequestContext,
  role: Role,
  sessionData: {
    warehouse: string;
    type?: string;
  },
): Promise<{ id: string }> {
  const session = await getAuthenticatedSession(request, role);
  const response = await request.post(`${BACKEND_BASE_URL}/api/sessions/`, {
    data: {
      warehouse: sessionData.warehouse,
      type: sessionData.type || "STANDARD",
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...buildClientHeaders(`playwright-${role}`),
    },
  });

  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { id: string };
}

export async function cleanupUserByUsername(
  request: APIRequestContext,
  username: string,
): Promise<void> {
  const adminSession = await getAuthenticatedSession(request, "admin");

  const headers = {
    Authorization: `Bearer ${adminSession.access_token}`,
  };

  const listResponse = await request.get(
    `${BACKEND_BASE_URL}/api/users?search=${encodeURIComponent(username)}&page=1&page_size=100`,
    { headers },
  );
  expect(listResponse.ok()).toBeTruthy();

  const listPayload = (await listResponse.json()) as {
    users?: Array<{ id: string; username: string }>;
  };

  const matches = (listPayload.users || []).filter(
    (user) => user.username === username,
  );

  for (const user of matches) {
    const deleteResponse = await request.delete(
      `${BACKEND_BASE_URL}/api/users/${user.id}`,
      { headers },
    );
    expect(deleteResponse.ok()).toBeTruthy();
  }
}
