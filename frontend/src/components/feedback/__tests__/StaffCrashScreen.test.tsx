import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import {
  StaffCrashScreen,
  isStaleReactQueryBundleError,
  resolveStaffCrashRecoveryTarget,
} from "../StaffCrashScreen";
import { haptics } from "@/services/haptics";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  usePathname: () => "/staff/home",
  useGlobalSearchParams: () => ({}),
}));

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn(),
  },
}));

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

describe("StaffCrashScreen micro-interactions & accessibility", () => {
  const mockError = new Error("Test staff scan crash message");
  const mockResetError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders screen content and action buttons with accessible labels", () => {
    const { getByText, getByLabelText } = render(
      <StaffCrashScreen error={mockError} resetError={mockResetError} />
    );

    expect(getByText("Scan Workflow Recovery Required")).toBeTruthy();
    expect(getByText("Test staff scan crash message")).toBeTruthy();

    const tryAgainButton = getByLabelText("Retry loading scan workflow");
    const navButton = getByLabelText("Return to staff home");
    const logoutButton = getByLabelText("Log out after scan workflow error");

    expect(tryAgainButton).toBeTruthy();
    expect(navButton).toBeTruthy();
    expect(logoutButton).toBeTruthy();
  });

  it("triggers haptics.light and resetError on Try Again press", () => {
    const { getByLabelText } = render(
      <StaffCrashScreen error={mockError} resetError={mockResetError} />
    );

    fireEvent.press(getByLabelText("Retry loading scan workflow"));

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(mockResetError).toHaveBeenCalledTimes(1);
  });

  it("triggers haptics.light, resetError, and navigates home on Staff Home press", () => {
    const { getByLabelText } = render(
      <StaffCrashScreen error={mockError} resetError={mockResetError} />
    );

    fireEvent.press(getByLabelText("Return to staff home"));

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(mockResetError).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/staff/home");
  });

  it("triggers haptics.light, resetError, and navigates to welcome on Logout press", () => {
    const { getByLabelText } = render(
      <StaffCrashScreen error={mockError} resetError={mockResetError} />
    );

    fireEvent.press(getByLabelText("Log out after scan workflow error"));

    expect(haptics.light).toHaveBeenCalledTimes(1);
    expect(mockResetError).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/welcome");
  });
});
