export type UserRole = "staff" | "supervisor" | "admin";

export const getRouteForRole = (role: UserRole): string => {
  switch (role) {
    case "supervisor":
      return "/supervisor/dashboard";
    case "admin":
      return "/admin/dashboard-web";
    case "staff":
      return "/staff/home";
    default:
      return "/welcome";
  }
};

export const isRouteAllowedForRole = (
  route: string,
  role: UserRole,
): boolean => {
  if (route.startsWith("/admin")) {
    return role === "admin";
  }
  if (route.startsWith("/supervisor")) {
    return role === "admin" || role === "supervisor";
  }
  if (route.startsWith("/staff")) {
    return role === "staff";
  }
  return true;
};
