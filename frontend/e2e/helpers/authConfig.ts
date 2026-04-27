import path from "node:path";

export type Role = "staff" | "supervisor" | "admin";

export const AUTH_ROLES: readonly Role[] = [
  "staff",
  "supervisor",
  "admin",
];

const webPort = Number(process.env.E2E_WEB_PORT || 8083);
export const FRONTEND_ROOT = path.resolve(__dirname, "../..");

export const FRONTEND_BASE_URL =
  process.env.E2E_BASE_URL || `http://localhost:${webPort}`;

export const BACKEND_BASE_URL =
  process.env.E2E_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  "http://localhost:8001";

export const AUTH_STATE_DIR = path.join(FRONTEND_ROOT, "playwright/.auth");

export const AUTH_STATE_FILES: Record<Role, string> = {
  staff: path.join(AUTH_STATE_DIR, "staff.json"),
  supervisor: path.join(AUTH_STATE_DIR, "supervisor.json"),
  admin: path.join(AUTH_STATE_DIR, "admin.json"),
};

export const ROLE_HOME_PATHS: Record<Role, string> = {
  staff: "/staff/home",
  supervisor: "/supervisor/dashboard",
  admin: "/admin/dashboard-web",
};

export const ROLE_PATH_PREFIXES: Record<Role, string> = {
  staff: "/staff/",
  supervisor: "/supervisor/",
  admin: "/admin/",
};

export const ROLE_CREDENTIAL_ENV: Record<
  Role,
  { password: string; username: string }
> = {
  staff: {
    username: "E2E_AUTH_STAFF_USERNAME",
    password: "E2E_AUTH_STAFF_PASSWORD",
  },
  supervisor: {
    username: "E2E_AUTH_SUPERVISOR_USERNAME",
    password: "E2E_AUTH_SUPERVISOR_PASSWORD",
  },
  admin: {
    username: "E2E_AUTH_ADMIN_USERNAME",
    password: "E2E_AUTH_ADMIN_PASSWORD",
  },
};

export const resolveAppUrl = (pathname: string) =>
  new URL(pathname, FRONTEND_BASE_URL).toString();

export const getRoleFromProjectName = (projectName: string): Role | null => {
  const prefix = projectName.split("-")[0];
  if (prefix === "staff" || prefix === "supervisor" || prefix === "admin") {
    return prefix;
  }
  return null;
};
