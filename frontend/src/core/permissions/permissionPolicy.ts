import { Permission, Role, ROLE_PERMISSIONS } from "@/constants/permissions";

export interface PermissionPolicyInput {
  role?: string | null;
  explicitPermissions?: string[] | null;
}

const VALID_ROLES = new Set<string>(Object.values(Role));

export const normalizeRole = (role?: string | null): Role => {
  const candidate = String(role || Role.STAFF).toLowerCase();
  if (VALID_ROLES.has(candidate)) {
    return candidate as Role;
  }
  return Role.STAFF;
};

const rolePermissions = (role: Role): string[] => {
  const defaults = ROLE_PERMISSIONS[role] || [];
  return defaults.map(String);
};

export const resolveEffectivePermissions = ({
  role,
  explicitPermissions,
}: PermissionPolicyInput): string[] => {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === Role.ADMIN) {
    return ["*"];
  }

  const fromUser = Array.isArray(explicitPermissions)
    ? explicitPermissions.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];

  if (fromUser.includes("*")) {
    return ["*"];
  }

  if (fromUser.length > 0) {
    return fromUser;
  }

  return rolePermissions(normalizedRole);
};

export const hasPermissionInPolicy = (
  policy: PermissionPolicyInput,
  permission: Permission | string,
): boolean => {
  const effective = resolveEffectivePermissions(policy);
  if (effective.includes("*")) {
    return true;
  }
  return effective.includes(String(permission));
};

