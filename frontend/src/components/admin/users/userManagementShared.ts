import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";

export type UserRole = "staff" | "supervisor" | "admin";

export interface User {
  id: string;
  username: string;
  email: string | null;
  fullName: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string | null;
  lastLogin: string | null;
  permissionsCount: number;
}

export interface UserListResponse {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type SortField = "username" | "email" | "role" | "created_at";
export type SortOrder = "asc" | "desc";

export interface UserFormState {
  username: string;
  email: string;
  fullName: string;
  password: string;
  pin: string;
  role: UserRole;
  isActive: boolean;
}

export const userTextStyles = {
  h2: {
    fontSize: 24,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 20,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600" as const,
  },
  caption: {
    fontSize: 12,
  },
};

export const USER_ROLE_OPTIONS: UserRole[] = ["staff", "supervisor", "admin"];

export const createEmptyUserForm = (): UserFormState => ({
  username: "",
  email: "",
  fullName: "",
  password: "",
  pin: "",
  role: "staff",
  isActive: true,
});

export const getRoleBadgeStyle = (role: UserRole, uiTokens: ThemeTokens) => {
  const color =
    role === "admin"
      ? uiTokens.colors.error
      : role === "supervisor"
        ? uiTokens.colors.warning
        : uiTokens.colors.accent;

  return {
    bg: colorWithAlpha(color, 0.12),
    text: color,
  };
};

export const getStatusStyle = (isActive: boolean, uiTokens: ThemeTokens) => {
  const color = isActive ? uiTokens.colors.success : uiTokens.colors.textMuted;

  return {
    bg: colorWithAlpha(color, 0.12),
    text: isActive ? color : uiTokens.colors.textSecondary,
  };
};

export const getOperationalActionColor = (
  action: "primary" | "success" | "warning" | "danger",
  uiTokens: ThemeTokens
) => {
  switch (action) {
    case "success":
      return uiTokens.colors.success;
    case "warning":
      return uiTokens.colors.warning;
    case "danger":
      return uiTokens.colors.error;
    default:
      return uiTokens.colors.accent;
  }
};
