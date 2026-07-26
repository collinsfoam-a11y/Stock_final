import { getRouteForRole, type UserRole } from "../roleNavigation";

export type SafeNavigationRouter = {
  back: () => void;
  canGoBack?: () => boolean;
  replace: (href: string) => void;
};

export type SafeBackOptions = {
  fallbackHref?: string;
  userRole?: UserRole | null;
  sessionFallbackHref?: string | null;
};

export function resolveSafeBackFallback(options: SafeBackOptions = {}) {
  if (options.sessionFallbackHref) return options.sessionFallbackHref;
  if (options.fallbackHref) return options.fallbackHref;
  if (options.userRole) return getRouteForRole(options.userRole);
  return "/welcome";
}

export function safeBackNavigation(router: SafeNavigationRouter, options: SafeBackOptions = {}) {
  if (typeof router.canGoBack === "function" && router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(resolveSafeBackFallback(options));
}

export default safeBackNavigation;
