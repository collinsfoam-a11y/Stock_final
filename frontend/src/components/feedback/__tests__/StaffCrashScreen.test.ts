import {
  isStaleReactQueryBundleError,
  resolveStaffCrashRecoveryTarget,
} from "../StaffCrashScreen";

describe("isStaleReactQueryBundleError", () => {
  it("detects the stale React Query web bundle crash signature", () => {
    const error = new TypeError(
      "(0,x.useQueryClient) is not a function. (In '(0,x.useQueryClient)()', '(0,x.useQueryClient)' is undefined)"
    );

    expect(isStaleReactQueryBundleError(error)).toBe(true);
  });

  it("detects the stale useReducedMotion web bundle crash signature", () => {
    const error = new TypeError(
      "(0,L.useReducedMotion) is not a function. (In '(0,L.useReducedMotion)()', '(0,L.useReducedMotion)' is undefined)"
    );

    expect(isStaleReactQueryBundleError(error)).toBe(true);
  });

  it("does not match unrelated render or provider errors", () => {
    expect(isStaleReactQueryBundleError(new Error("No QueryClient set"))).toBe(false);
    expect(isStaleReactQueryBundleError(new TypeError("foo is not a function"))).toBe(false);
  });
});

describe("resolveStaffCrashRecoveryTarget", () => {
  it("preserves the current scan session URL", () => {
    expect(
      resolveStaffCrashRecoveryTarget("/staff/scan", {
        sessionId: "session-123",
        debugPerf: "1",
      })
    ).toEqual({
      accessibilityLabel: "Return to current scan session",
      href: "/staff/scan?sessionId=session-123&debugPerf=1",
      label: "Back to Scan",
    });
  });

  it("returns from item detail to the current scan session", () => {
    expect(
      resolveStaffCrashRecoveryTarget("/staff/item-detail", {
        barcode: "890000000001",
        sessionId: "session-123",
      })
    ).toEqual({
      accessibilityLabel: "Return to current scan session",
      href: "/staff/scan?sessionId=session-123",
      label: "Back to Scan",
    });
  });

  it("falls back to staff home when no scan session is available", () => {
    expect(resolveStaffCrashRecoveryTarget("/staff/scan", {})).toEqual({
      accessibilityLabel: "Return to staff home",
      href: "/staff/home",
      label: "Staff Home",
    });
  });
});
