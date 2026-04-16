import { auroraTheme } from "@/theme/auroraTheme";

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
    fontFamily: auroraTheme.typography.fontFamily.heading,
    fontSize: auroraTheme.typography.fontSize["2xl"],
    fontWeight: "700" as const,
  },
  h3: {
    fontFamily: auroraTheme.typography.fontFamily.heading,
    fontSize: auroraTheme.typography.fontSize.xl,
    fontWeight: "600" as const,
  },
  body: {
    fontFamily: auroraTheme.typography.fontFamily.body,
    fontSize: auroraTheme.typography.fontSize.base,
  },
  label: {
    fontFamily: auroraTheme.typography.fontFamily.label,
    fontSize: auroraTheme.typography.fontSize.sm,
  },
  caption: {
    fontFamily: auroraTheme.typography.fontFamily.body,
    fontSize: auroraTheme.typography.fontSize.xs,
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

export const getRoleBadgeStyle = (role: UserRole) => {
  switch (role) {
    case "admin":
      return {
        bg: auroraTheme.colors.error[100],
        text: auroraTheme.colors.error[700],
      };
    case "supervisor":
      return {
        bg: auroraTheme.colors.warning[100],
        text: auroraTheme.colors.warning[700],
      };
    default:
      return {
        bg: auroraTheme.colors.primary[100],
        text: auroraTheme.colors.primary[700],
      };
  }
};

export const getStatusStyle = (isActive: boolean) =>
  isActive
    ? {
        bg: auroraTheme.colors.success[100],
        text: auroraTheme.colors.success[700],
      }
    : {
        bg: auroraTheme.colors.neutral[200],
        text: auroraTheme.colors.neutral[600],
      };
