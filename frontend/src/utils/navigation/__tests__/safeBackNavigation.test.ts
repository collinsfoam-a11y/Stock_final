import { resolveSafeBackFallback, safeBackNavigation } from "../safeBackNavigation";

describe("safeBackNavigation", () => {
  it("uses router.back when history is available", () => {
    const router = {
      back: jest.fn(),
      canGoBack: jest.fn(() => true),
      replace: jest.fn(),
    };

    safeBackNavigation(router, { fallbackHref: "/staff/home" });

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("uses the explicit fallback when history is unavailable", () => {
    const router = {
      back: jest.fn(),
      canGoBack: jest.fn(() => false),
      replace: jest.fn(),
    };

    safeBackNavigation(router, { fallbackHref: "/staff/home" });

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/staff/home");
  });

  it("resolves role and session-aware fallbacks", () => {
    expect(resolveSafeBackFallback({ sessionFallbackHref: "/staff/scan?sessionId=1" })).toBe(
      "/staff/scan?sessionId=1"
    );
    expect(resolveSafeBackFallback({ userRole: "supervisor" })).toBe("/supervisor/dashboard");
    expect(resolveSafeBackFallback({ userRole: "admin" })).toBe("/admin/dashboard-web");
    expect(resolveSafeBackFallback()).toBe("/welcome");
  });
});
